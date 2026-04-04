import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, CheckCircle, AlertTriangle, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import type { ImportantDocument, ChapterDocumentAck, MouSubmission } from "@shared/schema";

interface ImportantDocumentsPanelProps {
  chapterId: string;
}

const MOU_DRIVE_FOLDER = "https://drive.google.com/drive/folders/1eAi3sB1KBGZ9nKffbwJbGnaD6N7NIYkY?usp=sharing";

export default function ImportantDocumentsPanel({ chapterId }: ImportantDocumentsPanelProps) {
  const { toast } = useToast();
  const [selectedDocument, setSelectedDocument] = useState<ImportantDocument | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [mouDialogOpen, setMouDialogOpen] = useState(false);
  const [mouFileLink, setMouFileLink] = useState("");

  const {
    data: documents = [],
    isLoading: documentsLoading,
    isFetched: documentsFetched,
  } = useQuery<ImportantDocument[]>({
    queryKey: ["/api/important-documents"]
  });

  const {
    data: acks = [],
    isLoading: acksLoading,
    isFetched: acksFetched,
  } = useQuery<ChapterDocumentAck[]>({
    queryKey: ["/api/chapter-document-acks"]
  });

  const {
    data: mouSubmission,
    isLoading: mouSubmissionLoading,
    isFetched: mouSubmissionFetched,
  } = useQuery<MouSubmission | null>({
    queryKey: ["/api/mou-submissions/my-submission"],
    queryFn: async () => {
      const res = await fetch("/api/mou-submissions/my-submission", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    }
  });

  const isDashboardDataLoading =
    documentsLoading ||
    !documentsFetched ||
    acksLoading ||
    !acksFetched ||
    mouSubmissionLoading ||
    !mouSubmissionFetched;

  const acknowledgeMutation = useMutation({
    mutationFn: (documentId: string) => 
      apiRequest("POST", `/api/chapter-document-acks/${documentId}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-document-acks"] });
      toast({
        title: "Document Acknowledged",
        description: "You have confirmed reading this document.",
      });
      setConfirmDialogOpen(false);
      setSelectedDocument(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to acknowledge document",
        variant: "destructive",
      });
    }
  });

  const submitMouMutation = useMutation({
    mutationFn: (data: { driveFileLink: string }) => 
      apiRequest("POST", "/api/mou-submissions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mou-submissions/my-submission"] });
      toast({
        title: "MOU Submitted",
        description: "Your MOU submission has been recorded.",
      });
      setMouDialogOpen(false);
      setMouFileLink("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit MOU",
        variant: "destructive",
      });
    }
  });

  const isAcknowledged = (documentId: string) => {
    return acks.some(ack => ack.documentId === documentId && ack.acknowledged);
  };

  const handleAcknowledge = (doc: ImportantDocument) => {
    setSelectedDocument(doc);
    setConfirmDialogOpen(true);
  };

  const confirmAcknowledge = () => {
    if (selectedDocument) {
      acknowledgeMutation.mutate(selectedDocument.id);
    }
  };

  const handleSubmitMou = (e: React.FormEvent) => {
    e.preventDefault();
    submitMouMutation.mutate({ driveFileLink: mouFileLink });
  };

  const documentsPagination = usePagination(documents, {
    pageSize: 5,
    resetKey: documents.length,
  });

  if (isDashboardDataLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading important documents..." rows={3} compact />
        </CardContent>
      </Card>
    );
  }

  const mouDocument = documents.find(doc => doc.title.toLowerCase().includes("mou"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Important Documents
          </CardTitle>
          <CardDescription>
            Review and acknowledge important organizational documents. All documents must be read and acknowledged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.length === 0 ? (
            <p className="text-muted-foreground">No documents available.</p>
          ) : (
            <>
              {documentsPagination.paginatedItems.map((document) => {
                const acknowledged = isAcknowledged(document.id);
                const isMou = document.title.toLowerCase().includes("mou");
                
                return (
                  <Card key={document.id} className="hover-elevate transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                          acknowledged ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"
                        }`}>
                          {acknowledged ? (
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{document.title}</h3>
                            {acknowledged ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" /> Acknowledged
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-amber-600">
                                Pending
                              </Badge>
                            )}
                          </div>
                          {document.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{document.notes}</p>
                          )}
                          <a 
                            href={document.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                          >
                            View Document <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="shrink-0">
                          {!acknowledged && (
                            <Button
                              size="sm"
                              onClick={() => handleAcknowledge(document)}
                              data-testid={`button-acknowledge-${document.id}`}
                            >
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <PaginationControls
                currentPage={documentsPagination.currentPage}
                totalPages={documentsPagination.totalPages}
                itemsPerPage={documentsPagination.itemsPerPage}
                totalItems={documentsPagination.totalItems}
                startItem={documentsPagination.startItem}
                endItem={documentsPagination.endItem}
                onPageChange={documentsPagination.setCurrentPage}
                onItemsPerPageChange={documentsPagination.setItemsPerPage}
                itemLabel="documents"
              />

              {mouDocument && (
                <Card className="border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Submit Signed MOU
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          After signing the MOU, upload it to the shared folder and provide the link here.
                        </p>
                        {mouSubmission && (
                          <p className="text-sm text-green-600 mt-2">
                            Submitted on: {new Date(mouSubmission.submittedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => setMouDialogOpen(true)}
                        variant={mouSubmission ? "outline" : "default"}
                        data-testid="button-submit-mou"
                      >
                        {mouSubmission ? "Update Submission" : "Submit MOU"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Acknowledgement
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                You are about to acknowledge that you have read and understood:
              </p>
              <p className="font-medium text-foreground">
                "{selectedDocument?.title}"
              </p>
              <p className="text-amber-600 dark:text-amber-400 font-medium">
                Please make sure you have actually read the entire document before confirming. 
                This acknowledgement will be recorded and cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              data-testid="button-cancel-acknowledge"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAcknowledge}
              disabled={acknowledgeMutation.isPending}
              data-testid="button-confirm-acknowledge"
            >
              {acknowledgeMutation.isPending ? "Confirming..." : "I Have Read This Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mouDialogOpen} onOpenChange={setMouDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Signed MOU</DialogTitle>
            <DialogDescription>
              Upload your signed MOU to the shared Google Drive folder and paste the link below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitMou} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">Step 1:</span> Upload your signed MOU to{" "}
                <a 
                  href={MOU_DRIVE_FOLDER} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  this shared folder <ExternalLink className="inline h-3 w-3" />
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mouLink">Step 2: Paste your file link</Label>
              <Input
                id="mouLink"
                value={mouFileLink}
                onChange={(e) => setMouFileLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                required
                data-testid="input-mou-link"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMouDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitMouMutation.isPending}
                data-testid="button-confirm-mou"
              >
                {submitMouMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
