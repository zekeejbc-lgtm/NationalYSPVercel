import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Edit, Plus, ExternalLink, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ImportantDocument } from "@shared/schema";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

type DocumentAcknowledgement = {
  documentId: string;
  chapterId: string;
  chapterName: string;
  readAt: string | null;
};

export default function ImportantDocumentsManager() {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [editingDocument, setEditingDocument] = useState<ImportantDocument | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAcknowledgementsByDocumentId, setShowAcknowledgementsByDocumentId] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    title: "",
    url: "",
    notes: "",
  });

  const {
    data: documents = [],
    isLoading: documentsLoading,
    isFetched: documentsFetched,
  } = useQuery<ImportantDocument[]>({
    queryKey: ["/api/important-documents"]
  });

  const {
    data: acknowledgements = [],
    isLoading: acknowledgementsLoading,
    isFetched: acknowledgementsFetched,
  } = useQuery<DocumentAcknowledgement[]>({
    queryKey: ["/api/important-documents/acknowledgements"],
  });

  const isDashboardDataLoading =
    documentsLoading ||
    !documentsFetched ||
    acknowledgementsLoading ||
    !acknowledgementsFetched;

  const acknowledgementsByDocumentId = useMemo(() => {
    return acknowledgements.reduce<Record<string, DocumentAcknowledgement[]>>((acc, acknowledgement) => {
      if (!acc[acknowledgement.documentId]) {
        acc[acknowledgement.documentId] = [];
      }
      acc[acknowledgement.documentId].push(acknowledgement);
      return acc;
    }, {});
  }, [acknowledgements]);

  const handleAdd = () => {
    setEditingDocument(null);
    setFormData({
      title: "",
      url: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (document: ImportantDocument) => {
    setEditingDocument(document);
    setFormData({
      title: document.title,
      url: document.url,
      notes: document.notes || "",
    });
    setIsDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/important-documents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-documents"] });
      toast({
        title: "Success",
        description: "Document created successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create document",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) => 
      apiRequest("PATCH", `/api/important-documents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-documents"] });
      toast({
        title: "Success",
        description: "Document updated successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update document",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/important-documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-documents"] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDocument) {
      updateMutation.mutate({ id: editingDocument.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this document? This will also remove all chapter acknowledgements for this document."))) return;
    deleteMutation.mutate(id);
  };

  const toggleAcknowledgementsVisibility = (documentId: string) => {
    setShowAcknowledgementsByDocumentId((prev) => ({
      ...prev,
      [documentId]: !(prev[documentId] ?? true),
    }));
  };

  if (isDashboardDataLoading) {
    return <LoadingState label="Loading documents..." rows={3} compact />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Important Documents</CardTitle>
              <CardDescription>Manage documents that chapters must read and acknowledge</CardDescription>
            </div>
            <Button onClick={handleAdd} data-testid="button-add-document">
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground">No documents yet. Add your first document!</p>
          ) : (
            <div className="space-y-4">
              {documents.map((document) => {
                const documentAcknowledgements = acknowledgementsByDocumentId[document.id] || [];
                const isAcknowledgementsVisible = showAcknowledgementsByDocumentId[document.id] ?? true;

                return (
                <Card key={document.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg break-words">{document.title}</h3>
                        {document.notes && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                            {document.notes}
                          </p>
                        )}
                        <a 
                          href={document.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                        >
                          View Document <ExternalLink className="h-3 w-3" />
                        </a>
                        <div className="mt-3">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Acknowledged by ({documentAcknowledgements.length})
                            </p>
                            {documentAcknowledgements.length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => toggleAcknowledgementsVisibility(document.id)}
                                data-testid={`button-toggle-acknowledgements-${document.id}`}
                                aria-expanded={isAcknowledgementsVisible}
                              >
                                {isAcknowledgementsVisible ? "Hide" : "Show"}
                              </Button>
                            )}
                          </div>
                          {documentAcknowledgements.length === 0 ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              No chapters have acknowledged this document yet.
                            </p>
                          ) : isAcknowledgementsVisible ? (
                            <ul className="mt-1 space-y-1">
                              {documentAcknowledgements.map((acknowledgement) => (
                                <li
                                  key={`${acknowledgement.documentId}-${acknowledgement.chapterId}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  <span className="font-medium text-foreground">{acknowledgement.chapterName}</span>
                                  {acknowledgement.readAt ? ` - ${new Date(acknowledgement.readAt).toLocaleDateString()}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleEdit(document)}
                          data-testid={`button-edit-document-${document.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleDelete(document.id)}
                          data-testid={`button-delete-document-${document.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDocument ? "Edit Document" : "Add New Document"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                data-testid="input-document-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Document URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                placeholder="https://docs.google.com/document/d/..."
                data-testid="input-document-url"
              />
              <p className="text-xs text-muted-foreground">
                Enter a link to the document (Google Docs, PDF, etc.)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Additional notes about this document..."
                data-testid="input-document-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending} 
                data-testid="button-save-document"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Document"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-document"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
