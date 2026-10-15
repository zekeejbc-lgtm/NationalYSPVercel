import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Trash2, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CoalitionRegistration, CoalitionStatus } from "@shared/coalition";
import {
  COALITION_STATUS_LABELS,
  COALITION_TRANSITIONS,
  type CoalitionEvent,
} from "@shared/coalition";

type Results = {
  items: CoalitionRegistration[];
  total: number;
  page: number;
  emailConfigured: boolean;
  pendingEmails: number;
};
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Neutralize spreadsheet formula execution, including leading whitespace.
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export default function CoalitionManager() {
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CoalitionRegistration | null>(null);
  const [reviewing, setReviewing] = useState<CoalitionRegistration | null>(
    null,
  );
  const [nextStatus, setNextStatus] = useState<CoalitionStatus>("under_review");
  const [publicMessage, setPublicMessage] = useState("");
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery<CoalitionEvent[]>({
    queryKey: [`/api/coalition/registrations/${reviewing?.id}/events`],
    enabled: !!reviewing,
  });
  const { toast } = useToast();
  const url = `/api/coalition/registrations?type=${type}&page=${page}`;
  const { data, isLoading, error, refetch } = useQuery<Results>({
    queryKey: [url],
    staleTime: 0,
  });
  async function change(id: string, status?: CoalitionStatus) {
    setBusy(true);
    try {
      await apiRequest(
        status ? "PATCH" : "DELETE",
        `/api/coalition/registrations/${id}`,
        status ? { status, message: publicMessage } : undefined,
      );
      await queryClient.invalidateQueries({
        predicate: (query) =>
          String(query.queryKey[0]).startsWith("/api/coalition/"),
      });
      if (!status) {
        setDeleting(null);
        if (data?.items.length === 1 && page > 1) setPage(page - 1);
      }
      if (status) setReviewing(null);
      toast({
        title: status ? "Registration updated" : "Registration deleted",
      });
    } catch (e) {
      toast({
        title: "Unable to save",
        description: e instanceof Error ? e.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  function review(row: CoalitionRegistration, status?: CoalitionStatus) {
    setReviewing(row);
    setNextStatus(status || COALITION_TRANSITIONS[row.status][0] || row.status);
    setPublicMessage("");
  }
  async function retryMail() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/coalition/mail/retry");
      await refetch();
      toast({ title: "Email delivery retried" });
    } catch (e) {
      toast({
        title: "Unable to retry delivery",
        description: e instanceof Error ? e.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    setBusy(true);
    try {
      const rows: CoalitionRegistration[] = [];
      let current = 1;
      while (true) {
        const batch: Results = await apiRequest(
          "GET",
          `/api/coalition/registrations?type=${type}&page=${current}`,
        );
        rows.push(...batch.items);
        if (rows.length >= batch.total || batch.items.length === 0) break;
        current++;
      }
      const keys: (keyof CoalitionRegistration)[] = [
        "id",
        "registrationType",
        "fullName",
        "organizationName",
        "organizationType",
        "representativeName",
        "representativePosition",
        "email",
        "contactNumber",
        "city",
        "province",
        "organizationLink",
        "status",
        "noticeVersion",
        "consentedAt",
        "createdAt",
      ];
      const content = [
        keys.map(csvCell).join(","),
        ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
      ].join("\r\n");
      const blobUrl = URL.createObjectURL(
        new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `ysp-coalition-${type}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Youth Service Coalition
            </CardTitle>
            <CardDescription className="mt-2">
              Private registrations from the public sign-up form.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={busy || !data?.total}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="space-y-2 w-full sm:w-60">
            <Label htmlFor="coalition-filter">Registration type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="coalition-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All registrations</SelectItem>
                <SelectItem value="individual">Individuals</SelectItem>
                <SelectItem value="organization">Organizations</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {error ? "—" : (data?.total ?? 0)} applications
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Use these details only for coalition coordination. Keep exports
          private and delete them within 12 months of submission.
        </p>
        {data && (!data.emailConfigured || data.pendingEmails > 0) && (
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              {!data.emailConfigured
                ? "Email delivery is not connected. Applications and tracking still work; notifications remain queued."
                : `${data.pendingEmails} notification(s) are waiting for email delivery.`}
            </p>
            <Button
              variant="outline"
              disabled={busy || !data.emailConfigured}
              onClick={retryMail}
            >
              Retry email delivery
            </Button>
          </div>
        )}
        {isLoading ? (
          <div
            role="status"
            aria-label="Loading registrations"
            className="space-y-3"
          >
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-destructive">
              {error instanceof Error && error.message.startsWith("401:")
                ? "Your admin session has expired. Please sign in again."
                : "Unable to load applications. Please retry or reload the page."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !data?.items.length ? (
          <div className="text-center py-12 text-muted-foreground">
            No coalition registrations to show.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registrant</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Consent / submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="min-w-52">
                    <p className="font-medium">
                      {row.organizationName || row.fullName}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {row.registrationType}
                      {row.organizationType ? ` · ${row.organizationType}` : ""}
                    </p>
                    {row.representativeName && (
                      <p className="text-sm mt-1">
                        {row.representativeName} · {row.representativePosition}
                      </p>
                    )}
                    {row.organizationLink && (
                      <a
                        href={row.organizationLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                      >
                        Organization link
                      </a>
                    )}
                    <p className="font-mono text-xs text-muted-foreground mt-2 break-all">
                      {row.referenceCode || row.id}
                    </p>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${row.email}`}
                      className="text-primary hover:underline"
                    >
                      {row.email}
                    </a>
                    {row.contactNumber && (
                      <p className="text-sm mt-1">{row.contactNumber}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.city}
                    <p className="text-sm text-muted-foreground">
                      {row.province}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-40">
                    <p>
                      {new Date(row.createdAt).toLocaleDateString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Consent recorded
                      <br />
                      {row.noticeVersion}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.consentedAt).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.status}
                      disabled={busy}
                      onValueChange={(v) => review(row, v as CoalitionStatus)}
                    >
                      <SelectTrigger
                        className="w-44"
                        aria-label={`Status for ${row.organizationName || row.fullName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={row.status}>
                          {COALITION_STATUS_LABELS[row.status]}
                        </SelectItem>
                        {COALITION_TRANSITIONS[row.status].map((status) => (
                          <SelectItem key={status} value={status}>
                            {COALITION_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => review(row)}
                    >
                      Review
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Delete registration for ${row.organizationName || row.fullName}`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            disabled={!data || page * 50 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
        <Dialog
          open={!!reviewing}
          onOpenChange={(open) => {
            if (!open && !busy) setReviewing(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review coalition application</DialogTitle>
              <DialogDescription>
                {reviewing?.organizationName || reviewing?.fullName} · National
                Admin decisions are recorded and visible to the applicant.
              </DialogDescription>
            </DialogHeader>
            {reviewing && (
              <>
                <div className="space-y-3">
                  <Label htmlFor="coalition-review-status">
                    Application status
                  </Label>
                  <Select
                    value={nextStatus}
                    onValueChange={(v) => setNextStatus(v as CoalitionStatus)}
                    disabled={
                      busy || !COALITION_TRANSITIONS[reviewing.status].length
                    }
                  >
                    <SelectTrigger id="coalition-review-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!COALITION_TRANSITIONS[reviewing.status].length && (
                        <SelectItem value={reviewing.status}>
                          {COALITION_STATUS_LABELS[reviewing.status]}
                        </SelectItem>
                      )}
                      {COALITION_TRANSITIONS[reviewing.status].map((status) => (
                        <SelectItem key={status} value={status}>
                          {COALITION_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label htmlFor="coalition-review-message">
                    Message to applicant{" "}
                    {nextStatus === "declined" ||
                    nextStatus === "needs_information"
                      ? "(required)"
                      : "(optional)"}
                  </Label>
                  <Textarea
                    id="coalition-review-message"
                    maxLength={2000}
                    value={publicMessage}
                    disabled={busy}
                    onChange={(e) => setPublicMessage(e.target.value)}
                    placeholder="Explain the decision, request specific details, or share next steps. This message appears on the applicant's tracking page."
                  />
                  <Button
                    disabled={
                      busy ||
                      !COALITION_TRANSITIONS[reviewing.status].includes(
                        nextStatus,
                      ) ||
                      (["declined", "needs_information"].includes(nextStatus) &&
                        publicMessage.trim().length < 5)
                    }
                    onClick={() => change(reviewing.id, nextStatus)}
                  >
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save decision
                  </Button>
                </div>
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Application history</h3>
                  {historyLoading ? (
                    <Skeleton className="h-20" />
                  ) : historyError ? (
                    <p className="text-sm text-destructive">
                      Unable to load history. Close and reopen this review to
                      retry.
                    </p>
                  ) : (
                    <ol className="space-y-4">
                      {history?.map((item) => (
                        <li
                          key={item.id}
                          className="border-l-2 border-primary/30 pl-3"
                        >
                          <p className="text-sm font-semibold">
                            {COALITION_STATUS_LABELS[item.status]} ·{" "}
                            {item.actor === "admin"
                              ? "National Admin"
                              : item.actor === "applicant"
                                ? "Applicant"
                                : "System"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("en-PH", {
                              timeZone: "Asia/Manila",
                            })}
                          </p>
                          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                            {item.message}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open && !busy) setDeleting(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this registration?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the registration for{" "}
                {deleting?.organizationName || deleting?.fullName}. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  if (deleting) void change(deleting.id);
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Delete registration
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
