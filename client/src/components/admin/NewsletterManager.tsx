import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  newsletterDraftSchema,
  type NewsletterDraftInput,
} from "@shared/newsletter";
import { Mail, Plus } from "lucide-react";
import { NEWSLETTER_TEMPLATES } from "@shared/newsletter-templates";
import NewsletterEmailPreview from "./NewsletterEmailPreview";
import NewsletterSubscriberDetails from "./NewsletterSubscriberDetails";
import NewsletterRecipientPicker, {
  parseRecipientEmails,
} from "./NewsletterRecipientPicker";

type Subscriber = {
  id: string;
  email: string;
  status: string;
  source: string;
  isMember: boolean;
  isDirectoryEmail: boolean;
  lastSubscribedAt: string;
};
type Draft = NewsletterDraftInput & {
  id: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
};
type DeliveryStatus = {
  configured: boolean;
  automaticProcessing: boolean;
  pending: number;
  held: number;
  failed: number;
};
type Delivery = {
  id: string;
  recipient: string;
  status: string;
  isTest: boolean;
  attempts: number;
  lastError: string | null;
};
const empty: NewsletterDraftInput = {
  subject: "",
  previewText: "",
  content: "",
};
const date = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function NewsletterManager() {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [panel, setPanel] = useState(false);
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [form, setForm] = useState<NewsletterDraftInput>(empty);
  const [templateId, setTemplateId] = useState(NEWSLETTER_TEMPLATES[0].id);
  const template =
    NEWSLETTER_TEMPLATES.find((item) => item.id === templateId) ||
    NEWSLETTER_TEMPLATES[0];
  const [testEmail, setTestEmail] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("subscribed");
  const [audience, setAudience] = useState("selected");
  const [recipientInput, setRecipientInput] = useState("");
  const subscribers = useQuery<Subscriber[]>({
    queryKey: ["/api/newsletter/subscribers"],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const drafts = useQuery<Draft[]>({
    queryKey: ["/api/newsletter/drafts"],
    refetchInterval: 15000,
  });
  const status = useQuery<DeliveryStatus>({
    queryKey: ["/api/newsletter/status"],
    refetchInterval: 15000,
  });
  const deliveries = useQuery<Delivery[]>({
    queryKey: [`/api/newsletter/drafts/${selected?.id}/deliveries`],
    enabled: panel && !!selected,
    refetchInterval: 15000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        String(query.queryKey[0]).startsWith("/api/newsletter/"),
    });
  const action = useMutation({
    mutationFn: ({
      method,
      path,
      body,
    }: {
      method: string;
      path: string;
      body?: unknown;
    }) => apiRequest(method, `/api/newsletter/${path}`, body),
    onSuccess: () => {
      void refresh();
    },
    onError: (error: Error) =>
      toast({
        title: "Newsletter request failed",
        description: error.message,
        variant: "destructive",
      }),
  });
  const run = async (method: string, path: string, body?: unknown) => {
    try {
      return await action.mutateAsync({ method, path, body });
    } catch {
      return null;
    }
  };
  const save = async () => {
    const parsed = newsletterDraftSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: "Check your draft",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }
    const saved = await run(
      selected ? "PATCH" : "POST",
      selected ? `drafts/${selected.id}` : "drafts",
      { ...parsed.data, requestId: crypto.randomUUID() },
    );
    if (saved) {
      setPanel(false);
      toast({ title: "Draft saved" });
    }
  };
  const open = (draft: Draft | null) => {
    setAudience("selected");
    setRecipientInput("");
    setTemplateId(NEWSLETTER_TEMPLATES[0].id);
    setSelected(draft);
    setForm(
      draft
        ? {
            subject: draft.subject,
            previewText: draft.previewText,
            content: draft.content,
          }
        : empty,
    );
    setTestEmail("");
    setPanel(true);
  };
  const active = (subscribers.data || []).filter(
    (sub) => sub.status === "subscribed",
  );
  const activeEmails = active.map((subscriber) => subscriber.email).sort();
  const recipientEmails = parseRecipientEmails(recipientInput);
  const invalidRecipients = recipientEmails.some(
    (email) => !activeEmails.includes(email),
  );
  const audienceCount =
    audience === "all" ? active.length : recipientEmails.length;
  const audienceValid =
    audienceCount > 0 &&
    (audience === "all" ||
      (!invalidRecipients && recipientEmails.length <= 1000));
  const visible = (subscribers.data || []).filter(
    (sub) =>
      (filter === "all" || sub.status === filter) &&
      sub.email.toLowerCase().includes(search.toLowerCase()),
  );
  const readOnly = !!selected && selected.status !== "draft";
  const dirty =
    selected &&
    (form.subject !== selected.subject ||
      form.previewText !== selected.previewText ||
      form.content !== selected.content);
  const busy = action.isPending;
  const error = subscribers.error || drafts.error || status.error;

  if (subscriberId) return <NewsletterSubscriberDetails key={subscriberId} id={subscriberId} onBack={() => setSubscriberId(null)} />;

  if (subscribers.isPending || drafts.isPending || status.isPending)
    return <LoadingState label="Loading newsletter data..." rows={2} compact />;
  if (error)
    return (
      <Card>
        <CardContent className="space-y-3 p-6" role="alert">
          <p>
            Newsletter data could not be loaded. Subscriber and draft counts are
            unavailable.
          </p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </CardContent>
      </Card>
    );

  return (
    <>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Newsletter
            </CardTitle>
            <CardDescription>
              Manage subscriptions, prepare newsletters, and follow delivery
              progress.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button
              onClick={() => open(null)}
              data-testid="button-open-newsletter-draft-panel"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Draft
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Active subscribers", active.length],
              ["Matched members", active.filter((sub) => sub.isMember).length],
              ["Unsubscribed", (subscribers.data || []).length - active.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <p className="font-medium">
              Email delivery{" "}
              {status.data?.configured ? "connected" : "not configured"}
            </p>
            {!status.data?.configured && (
              <p className="text-sm text-muted-foreground">
                Set up the existing email connection before testing or sending
                newsletters.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {status.data?.pending || 0} queued · {status.data?.failed || 0}{" "}
              failed · {status.data?.held || 0} held deliveries. Processing sends up to two emails at a time.
              Failed attempts retry after five minutes, for up to 24 hours.
            </p>
            {!status.data?.automaticProcessing && (
              <p className="text-sm text-muted-foreground">
                Automatic processing is not enabled. Use Process Queue while an
                administrator configures the newsletter worker.
              </p>
            )}
            <Button
              variant="outline"
              disabled={
                busy || !status.data?.configured || !status.data?.pending
              }
              onClick={async () => {
                const result = await run("POST", "process");
                if (result)
                  toast({
                    title: "Queue processed",
                    description: `${result.processed} delivery attempts processed.`,
                  });
              }}
            >
              Process Queue
            </Button>
          </div>
          <section className="rounded-xl border">
            <div className="space-y-3 border-b p-4">
              <h3 className="font-semibold">Subscribers</h3>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="sm:max-w-xs"
                  aria-label="Search subscribers"
                  placeholder="Search email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger
                    className="w-full sm:w-44"
                    aria-label="Subscription status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscribed">Subscribed</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Member opt-ins are imported automatically. Directory matches are
                labels; they do not subscribe anyone. Opt-outs are preserved.
              </p>
            </div>
            {!visible.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No matching subscribers.
              </p>
            ) : (
              <div className="max-h-96 divide-y overflow-auto">
                {visible.map((sub) => (
                  <button
                    type="button"
                    key={sub.id}
                    onClick={() => setSubscriberId(sub.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium">{sub.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {sub.source === "membership"
                          ? "Membership opt-in"
                          : "Website subscription"}{" "}
                        · {date(sub.lastSubscribedAt)} PHT
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{sub.status}</Badge>
                      {sub.isMember && (
                        <Badge variant="secondary">Member</Badge>
                      )}
                      {sub.isDirectoryEmail && (
                        <Badge variant="secondary">Directory match</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-xl border">
            <div className="border-b p-4">
              <h3 className="font-semibold">Drafts and campaigns</h3>
              <p className="text-sm text-muted-foreground">
                Open a draft to edit, preview, or send. Dates use Philippine
                time. Showing the latest 100.
              </p>
            </div>
            {!drafts.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No drafts yet.
              </p>
            ) : (
              <div className="divide-y">
                {drafts.data.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <button
                        className="text-left font-medium underline-offset-4 hover:underline"
                        onClick={() => open(draft)}
                      >
                        {draft.subject}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {date(draft.createdAt)} PHT · {draft.recipientCount}{" "}
                        recipients · {draft.sentCount} sent ·{" "}
                        {draft.failedCount} failed · {draft.skippedCount}{" "}
                        skipped
                      </p>
                    </div>
                    <Badge
                      variant={draft.status === "sent" ? "default" : "outline"}
                    >
                      {draft.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
      <Sheet open={panel} onOpenChange={setPanel}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>
              {selected
                ? readOnly
                  ? "Campaign details"
                  : "Edit newsletter"
                : "Create newsletter draft"}
            </SheetTitle>
            <SheetDescription>
              {readOnly
                ? "Queued and sent campaign content cannot be changed."
                : "Save your changes before sending a test or queuing delivery."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="newsletter-draft-subject">Email subject</Label>
              <Input
                id="newsletter-draft-subject"
                maxLength={120}
                value={form.subject}
                disabled={readOnly || busy}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="newsletter-draft-preview">
                Preview text (optional)
              </Label>
              <Input
                id="newsletter-draft-preview"
                maxLength={200}
                value={form.previewText}
                disabled={readOnly || busy}
                onChange={(e) =>
                  setForm({ ...form, previewText: e.target.value })
                }
              />
            </div>
            {!readOnly && (
              <section
                className="space-y-3 rounded-lg border bg-muted/20 p-4"
                aria-label="Newsletter templates"
              >
                <Label htmlFor="newsletter-template">
                  Start from a template
                </Label>
                <Select
                  value={templateId}
                  disabled={busy}
                  onValueChange={setTemplateId}
                >
                  <SelectTrigger id="newsletter-template">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {NEWSLETTER_TEMPLATES.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Suggested subject:</span>{" "}
                  {template.subject}
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !(
                        form.subject.trim() ||
                        form.previewText.trim() ||
                        form.content.trim()
                      ) ||
                      (await confirm({
                        title: "Apply newsletter template?",
                        description: `Replace the current subject, preview text, and message with the ${template.name.toLowerCase()} template?`,
                        confirmLabel: "Use template",
                      }))
                    )
                      setForm({
                        subject: template.subject,
                        previewText: template.previewText,
                        content: template.content,
                      });
                  }}
                >
                  Apply template
                </Button>
                <p className="text-xs text-muted-foreground">
                  Replace the details in [brackets] before sending. All
                  templates use the YSP email design and official motto.
                  Applying a template does not save or send it.
                </p>
              </section>
            )}
            <div>
              <Label htmlFor="newsletter-draft-content">Message body</Label>
              <Textarea
                id="newsletter-draft-content"
                className="min-h-80"
                maxLength={7000}
                value={form.content}
                disabled={readOnly || busy}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {form.content.length}/7000 characters. Plain text with
                paragraphs and links.
              </p>
            </div>
            {!readOnly && (
              <Button
                disabled={busy}
                onClick={() => void save()}
                data-testid="button-save-newsletter-draft"
              >
                {busy ? "Working..." : "Save draft"}
              </Button>
            )}
            {selected && (
              <div className="space-y-3 rounded-lg border p-4">
                <Label htmlFor="newsletter-test-email">Test recipient</Label>
                <Input
                  id="newsletter-test-email"
                  type="email"
                  maxLength={254}
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.org"
                />
                <Button
                  variant="outline"
                  disabled={
                    busy || !!dirty || !testEmail || !status.data?.configured
                  }
                  onClick={async () => {
                    const result = await run(
                      "POST",
                      `drafts/${selected.id}/test`,
                      { email: testEmail, requestId: crypto.randomUUID() },
                    );
                    if (result)
                      toast({
                        title: "Test email queued",
                        description: result.message,
                      });
                  }}
                >
                  Queue test email
                </Button>
                <p className="text-xs text-muted-foreground">
                  Tests use the saved content. Check the delivered test before
                  sending to subscribers.
                </p>
              </div>
            )}
            {selected && !readOnly && (
              <div className="space-y-3 border-t pt-4">
                <Label htmlFor="newsletter-audience">Send to</Label>
                <Select
                  value={audience}
                  onValueChange={setAudience}
                  disabled={busy}
                >
                  <SelectTrigger id="newsletter-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selected">
                      Specific recipients
                    </SelectItem>
                    <SelectItem value="all">All subscribers</SelectItem>
                  </SelectContent>
                </Select>
                {audience === "selected" && (
                  <NewsletterRecipientPicker
                    value={recipientInput}
                    onChange={setRecipientInput}
                    emails={activeEmails}
                    disabled={busy}
                  />
                )}
                <p className="text-sm">
                  Audience: {audience === "all" ? "all" : "selected"}{" "}
                  {audienceCount} subscribed emails.
                  {audience === "selected" && recipientEmails.length > 1000
                    ? " Select at most 1,000 recipients per campaign."
                    : " Subscription status is checked again before delivery."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      busy ||
                      !!dirty ||
                      !audienceValid ||
                      !status.data?.configured
                    }
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "Send this newsletter?",
                          description: `Queue “${selected.subject}” for ${audience === "all" ? "all" : "these"} ${audienceCount} subscribed recipients? ${audience === "selected" ? recipientEmails.join(", ") : ""} This starts delivery and locks the campaign.`,
                          confirmLabel: "Queue newsletter",
                        }))
                      )
                        return;
                      const result = await run(
                        "POST",
                        `drafts/${selected.id}/send`,
                        audience === "selected" ? { recipientEmails } : {},
                      );
                      if (result) {
                        setPanel(false);
                        toast({
                          title: "Newsletter queued",
                          description: `${result.recipientCount} recipients queued.`,
                        });
                      }
                    }}
                  >
                    Send newsletter
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "Delete draft?",
                          description:
                            "Permanently delete this unsent newsletter draft?",
                          destructive: true,
                          confirmLabel: "Delete draft",
                        }))
                      )
                        return;
                      if (await run("DELETE", `drafts/${selected.id}`))
                        setPanel(false);
                    }}
                  >
                    Delete draft
                  </Button>
                </div>
                {dirty && (
                  <p className="text-sm text-muted-foreground">
                    Save your changes to enable testing and sending.
                  </p>
                )}
              </div>
            )}
            {selected && (
              <section className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">Recent delivery attempts</h3>
                <p className="text-xs text-muted-foreground">
                  Latest 100 recipients, including tests. Refreshes
                  automatically.
                </p>
                {deliveries.isError ? (
                  <p role="alert" className="text-sm">
                    Delivery history is unavailable.{" "}
                    <button
                      className="underline"
                      onClick={() => void deliveries.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : deliveries.isPending ? (
                  <p className="text-sm">Loading delivery history...</p>
                ) : !deliveries.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No delivery attempts yet.
                  </p>
                ) : (
                  deliveries.data.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="rounded border p-3 text-sm"
                    >
                      <p className="break-all">
                        {delivery.isTest ? "Test: " : ""}
                        {delivery.recipient}
                      </p>
                      <p>
                        {delivery.status} · {delivery.attempts} attempts
                      </p>
                      {delivery.lastError && (
                        <p className="text-destructive">{delivery.lastError}</p>
                      )}
                    </div>
                  ))
                )}
              </section>
            )}
            <NewsletterEmailPreview draft={form} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
