import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, Mail, Plus, SendHorizontal, Users } from "lucide-react";

type NewsletterSubscriber = {
  id: string;
  email: string;
  isMember: boolean;
  isDirectoryEmail: boolean;
  matchedMemberCount: number;
  matchedOfficerCount: number;
  matchedChapterCount: number;
  createdAt: string;
  updatedAt: string;
  lastSubscribedAt: string;
};

type NewsletterDraft = {
  id: string;
  subject: string;
  previewText: string | null;
  content: string;
  status: string;
  recipientScope: string;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
};

const INITIAL_DRAFT_FORM = {
  subject: "",
  previewText: "",
  content: "",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NewsletterManager() {
  const { toast } = useToast();
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [draftForm, setDraftForm] = useState(INITIAL_DRAFT_FORM);

  const {
    data: subscribers = [],
    isLoading: subscribersLoading,
    isFetched: subscribersFetched,
  } = useQuery<NewsletterSubscriber[]>({
    queryKey: ["/api/newsletter/subscribers"],
  });

  const {
    data: drafts = [],
    isLoading: draftsLoading,
    isFetched: draftsFetched,
  } = useQuery<NewsletterDraft[]>({
    queryKey: ["/api/newsletter/drafts"],
  });

  const createDraftMutation = useMutation({
    mutationFn: async (payload: typeof INITIAL_DRAFT_FORM) => {
      return apiRequest("POST", "/api/newsletter/drafts", payload);
    },
    onSuccess: () => {
      toast({
        title: "Draft created",
        description: "Newsletter draft has been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/newsletter/drafts"] });
      setDraftForm(INITIAL_DRAFT_FORM);
      setIsCreatePanelOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Unable to create draft",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const summary = useMemo(() => {
    const members = subscribers.filter((subscriber) => subscriber.isMember).length;
    const directoryOnly = subscribers.filter(
      (subscriber) => !subscriber.isMember && subscriber.isDirectoryEmail,
    ).length;

    return {
      total: subscribers.length,
      members,
      directoryOnly,
    };
  }, [subscribers]);

  const isLoading = subscribersLoading || !subscribersFetched || draftsLoading || !draftsFetched;

  const handleSaveDraft = () => {
    const subject = draftForm.subject.trim();
    const content = draftForm.content.trim();

    if (!subject) {
      toast({
        title: "Subject is required",
        description: "Please enter an email subject.",
        variant: "destructive",
      });
      return;
    }

    if (!content) {
      toast({
        title: "Message is required",
        description: "Please enter the email message body.",
        variant: "destructive",
      });
      return;
    }

    createDraftMutation.mutate({
      subject,
      previewText: draftForm.previewText.trim(),
      content,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading newsletter data..." rows={2} compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Newsletter
            </CardTitle>
            <CardDescription>
              View newsletter subscribers and prepare broadcast drafts for sending.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => setIsCreatePanelOpen(true)}
            data-testid="button-open-newsletter-draft-panel"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Draft
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Total Subscribers</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-2xl font-semibold" data-testid="text-newsletter-total-subscribers">
                  {summary.total}
                </p>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Matched Members</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-2xl font-semibold">{summary.members}</p>
                <Badge variant="outline">Member</Badge>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Directory-only Matches</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-2xl font-semibold">{summary.directoryOnly}</p>
                <Badge variant="secondary">Directory</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Subscribers</h3>
              <p className="text-sm text-muted-foreground">People currently included in newsletter delivery.</p>
            </div>
            {subscribers.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No subscribers yet.</div>
            ) : (
              <div className="divide-y">
                {subscribers.map((subscriber) => (
                  <div
                    key={subscriber.id}
                    className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    data-testid={`newsletter-subscriber-${subscriber.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{subscriber.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Last subscribed: {formatDateTime(subscriber.lastSubscribedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {subscriber.isMember && <Badge variant="outline">Member</Badge>}
                      {subscriber.isDirectoryEmail && <Badge variant="secondary">Directory</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Recent Drafts</h3>
              <p className="text-sm text-muted-foreground">Saved email drafts that can be sent later.</p>
            </div>
            {drafts.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">No drafts yet.</div>
            ) : (
              <div className="divide-y">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    data-testid={`newsletter-draft-${draft.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{draft.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(draft.createdAt)} • Recipients: {draft.recipientCount}
                      </p>
                    </div>
                    <Badge variant={draft.status === "ready" ? "default" : "outline"}>
                      {draft.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet open={isCreatePanelOpen} onOpenChange={setIsCreatePanelOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SendHorizontal className="h-5 w-5" />
              Create Newsletter Draft
            </SheetTitle>
            <SheetDescription>
              Draft a newsletter email that can be sent to all current subscribers.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newsletter-draft-subject">Email Subject</Label>
              <Input
                id="newsletter-draft-subject"
                value={draftForm.subject}
                onChange={(e) => setDraftForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject line"
                data-testid="input-newsletter-draft-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newsletter-draft-preview">Preview Text (optional)</Label>
              <Input
                id="newsletter-draft-preview"
                value={draftForm.previewText}
                onChange={(e) => setDraftForm((prev) => ({ ...prev, previewText: e.target.value }))}
                placeholder="Short preview shown in inbox"
                data-testid="input-newsletter-draft-preview"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newsletter-draft-content">Message Body</Label>
              <Textarea
                id="newsletter-draft-content"
                value={draftForm.content}
                onChange={(e) => setDraftForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Write your newsletter message..."
                className="min-h-[220px]"
                data-testid="textarea-newsletter-draft-content"
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Recipient scope</p>
              <p className="mt-1">All subscribed emails</p>
              <p className="mt-1">Current recipients: {summary.total}</p>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsCreatePanelOpen(false)}
              disabled={createDraftMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDraft}
              disabled={createDraftMutation.isPending}
              data-testid="button-save-newsletter-draft"
            >
              <FileText className="h-4 w-4 mr-2" />
              {createDraftMutation.isPending ? "Saving..." : "Save Draft"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
