import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import NewsletterEmailPreview from "./NewsletterEmailPreview";

type Delivery = {
  id: string; subject: string; previewText: string; content: string;
  status: string; isTest: boolean; attempts: number; lastError: string | null;
  createdAt: string; sentAt: string | null; nextAttemptAt: string; heldAt: string | null;
  resendOf: string | null;
};
type Details = {
  subscriber: { id: string; email: string; status: string; source: string; lastSubscribedAt: string };
  deliveries: Delivery[]; hasMore: boolean;
};
const date = (value: string) => new Date(value).toLocaleString("en-PH", {
  timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
});

export default function NewsletterSubscriberDetails({ id, onBack }: { id: string; onBack: () => void }) {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ block: "start" }); }, []);
  const [page, setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [verification, setVerification] = useState("");
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const details = useQuery<Details>({
    queryKey: [`/api/newsletter/subscribers/${id}?page=${page}`], refetchInterval: 15000,
  });
  const refresh = () => queryClient.invalidateQueries({
    predicate: (query) => String(query.queryKey[0]).startsWith("/api/newsletter/"),
  });
  const mutation = useMutation({
    mutationFn: ({ method, path, body }: { method: string; path: string; body: unknown }) =>
      apiRequest(method, `/api/newsletter/subscribers/${id}${path}`, body),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast({ title: "Newsletter request failed", description: error.message, variant: "destructive" }),
  });
  const subscriber = details.data?.subscriber;
  const preview = details.data?.deliveries.find((delivery) => delivery.id === previewId);
  const busy = mutation.isPending;
  const control = async (delivery: Delivery, action: "hold" | "retry" | "resend") => {
    if (action !== "hold" && !(await confirm({
      title: action === "resend" ? "Resend this newsletter?" : "Queue this delivery now?",
      description: `Queue “${delivery.subject}” for ${subscriber?.email}. ${action === "resend" ? "They will receive another copy." : "If an earlier attempt reached their inbox without confirmation, another copy may arrive."}`,
      confirmLabel: action === "resend" ? "Resend" : "Queue delivery",
    }))) return;
    try {
      await mutation.mutateAsync({ method: "POST", path: `/deliveries/${delivery.id}/action`, body: { action, requestId: crypto.randomUUID() } });
      toast({ title: action === "hold" ? "Delivery held" : "Delivery queued", description: action === "hold" ? "This message will wait until you resume it." : "The newsletter worker or Process Queue will send it." });
    } catch { /* The mutation displays the error. */ }
  };

  return <Card ref={top} className="scroll-mt-28">
    <CardHeader className="space-y-4">
      <Button variant="outline" className="w-fit" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Back to newsletters</Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="break-all">{subscriber?.email || "Subscriber details"}</CardTitle>
          {subscriber && <p className="mt-2 text-sm text-muted-foreground">{subscriber.status} · Last subscribed {date(subscriber.lastSubscribedAt)} PHT</p>}
        </div>
        {subscriber && <Button variant="destructive" disabled={busy} onClick={() => { setVerification(""); setDeleting(true); }}><Trash2 className="mr-2 h-4 w-4" />Delete subscriber</Button>}
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <h3 className="font-semibold">Newsletter delivery history</h3>
      <p className="text-sm text-muted-foreground">Sent, queued, held, failed, and skipped emails, including test messages. Open a message to preview its saved content. Dates use Philippine time.</p>
      {details.isPending && <p role="status">Loading delivery history…</p>}
      {details.error && <div role="alert"><p>{details.error.message}</p><Button variant="outline" onClick={() => void details.refetch()}>Retry loading</Button></div>}
      {details.data && !details.data.deliveries.length && <p className="py-6 text-sm text-muted-foreground">No newsletter deliveries on this page.</p>}
      <div className="divide-y rounded-lg border">
        {details.data?.deliveries.map((delivery) => <div key={delivery.id} className="space-y-3 p-4">
          <button className="block w-full space-y-2 text-left rounded-md focus-visible:outline focus-visible:outline-2" onClick={() => setPreviewId(delivery.id)}>
            <span className="block break-words font-medium underline-offset-4 hover:underline">{delivery.subject}</span>
            <span className="flex flex-wrap gap-2"><Badge variant="outline">{delivery.heldAt && delivery.status === "queued" ? "held" : delivery.status}</Badge>{delivery.isTest && <Badge variant="secondary">Test</Badge>}{delivery.resendOf && <Badge variant="secondary">Requeued copy</Badge>}</span>
            <span className="block text-xs text-muted-foreground">Created {date(delivery.createdAt)} PHT · {delivery.attempts} attempts{delivery.sentAt ? ` · Sent ${date(delivery.sentAt)} PHT` : ""}</span>
            {delivery.status === "queued" && !delivery.heldAt && <span className="block text-xs text-muted-foreground">Next attempt {date(delivery.nextAttemptAt)} PHT</span>}
          </button>
          {delivery.lastError && <p className="break-words text-sm text-destructive">{delivery.lastError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPreviewId(delivery.id)}>View preview</Button>
            {subscriber?.status === "subscribed" && <>
              {delivery.status === "queued" && !delivery.heldAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => void control(delivery, "hold")}>Hold</Button>}
              {(delivery.status === "queued" || delivery.status === "failed") && <Button size="sm" disabled={busy} onClick={() => void control(delivery, "retry")}>{delivery.heldAt ? "Resume" : delivery.status === "failed" ? "Retry" : "Retry now"}</Button>}
              {delivery.status === "sent" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void control(delivery, "resend")}>Resend</Button>}
            </>}
          </div>
        </div>)}
      </div>
      {details.data && <div className="flex items-center gap-3"><Button variant="outline" disabled={!page} onClick={() => { setPage(page - 1); setPreviewId(null); }}>Previous</Button><span className="text-sm">Page {page + 1}</span><Button variant="outline" disabled={!details.data.hasMore} onClick={() => { setPage(page + 1); setPreviewId(null); }}>Next</Button></div>}
    </CardContent>
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreviewId(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{preview?.subject}</DialogTitle><DialogDescription>Saved delivery content for {subscriber?.email}. {preview?.isTest ? "The delivered message is marked as a test." : "The delivered message includes their private unsubscribe link."}</DialogDescription></DialogHeader>
        {preview && <>
          <NewsletterEmailPreview draft={preview} isTest={preview.isTest} />
          {subscriber?.status === "subscribed" && <div className="flex flex-wrap gap-2">
            {preview.status === "queued" && !preview.heldAt && <Button variant="outline" disabled={busy} onClick={() => void control(preview, "hold")}>Hold delivery</Button>}
            {(preview.status === "queued" || preview.status === "failed") && <Button disabled={busy} onClick={() => void control(preview, "retry")}>{preview.heldAt ? "Resume delivery" : "Retry delivery"}</Button>}
            {preview.status === "sent" && <Button disabled={busy} onClick={() => void control(preview, "resend")}>Resend newsletter</Button>}
          </div>}
        </>}
      </DialogContent>
    </Dialog>
    <Dialog open={deleting} onOpenChange={(open) => { if (!busy) setDeleting(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete subscriber</DialogTitle><DialogDescription>Remove this subscriber and cancel their queued or held emails. Delivery history is retained, and automatic member imports will not add them back. Emails already being sent may still arrive.</DialogDescription></DialogHeader>
        <Label htmlFor="delete-newsletter-email">Type {subscriber?.email} to confirm</Label>
        <Input id="delete-newsletter-email" autoComplete="off" value={verification} disabled={busy} onChange={(event) => setVerification(event.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !subscriber || verification !== subscriber.email} onClick={async () => {
            try {
              await mutation.mutateAsync({ method: "DELETE", path: "", body: { email: verification } });
              toast({ title: "Subscriber deleted" }); onBack();
            } catch { /* The mutation displays the error. */ }
          }}>{busy ? "Deleting…" : "Delete subscriber"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </Card>;
}
