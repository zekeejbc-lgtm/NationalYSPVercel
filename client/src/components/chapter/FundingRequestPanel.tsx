import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Plus, CheckCircle, XCircle, AlertCircle, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import type { ChapterRequest } from "@shared/schema";

interface FundingRequestPanelProps {
  chapterId: string;
}

export default function FundingRequestPanel({ chapterId }: FundingRequestPanelProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    proposedActivityName: "",
    date: "",
    time: "",
    rationale: "",
    howNationalCanHelp: "",
    details: "",
  });

  const { data: requests = [], isLoading } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests/my-requests"],
    queryFn: async () => {
      const res = await fetch("/api/chapter-requests/my-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => 
      apiRequest("POST", "/api/chapter-requests", {
        ...data,
        type: "funding_request",
        date: data.date ? new Date(data.date).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests/my-requests"] });
      toast({
        title: "Request Submitted",
        description: "Your funding request has been sent to YSP National.",
      });
      setIsDialogOpen(false);
      setFormData({
        proposedActivityName: "",
        date: "",
        time: "",
        rationale: "",
        howNationalCanHelp: "",
        details: "",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit request",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case "in_review":
        return <Badge className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" /> In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Funding Requests
              </CardTitle>
              <CardDescription>
                Submit requests for YSP National support for your chapter activities
              </CardDescription>
            </div>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-request">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No requests submitted yet.</p>
              <p className="text-sm text-muted-foreground">
                Submit a funding request when you need support from YSP National for your chapter activities.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <Card key={request.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {getStatusBadge(request.status)}
                        </div>
                        <h3 className="font-semibold text-lg">{request.proposedActivityName || "Unnamed Activity"}</h3>
                        {request.date && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(request.date), "MMMM d, yyyy")}
                            {request.time && ` at ${request.time}`}
                          </p>
                        )}
                        {request.rationale && (
                          <div className="mt-3">
                            <p className="text-sm font-medium">Rationale:</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{request.rationale}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-3">
                          Submitted: {format(new Date(request.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Funding Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="activityName">Proposed Activity Name *</Label>
              <Input
                id="activityName"
                value={formData.proposedActivityName}
                onChange={(e) => setFormData({ ...formData, proposedActivityName: e.target.value })}
                required
                placeholder="e.g., Tree Planting Activity"
                data-testid="input-activity-name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Proposed Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  data-testid="input-activity-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Proposed Time</Label>
                <Input
                  id="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  placeholder="e.g., 9:00 AM - 12:00 PM"
                  data-testid="input-activity-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rationale">Rationale *</Label>
              <Textarea
                id="rationale"
                value={formData.rationale}
                onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                required
                rows={3}
                placeholder="Why is this activity important? What are its goals?"
                data-testid="input-rationale"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="howNationalCanHelp">How Can YSP National Help? *</Label>
              <Textarea
                id="howNationalCanHelp"
                value={formData.howNationalCanHelp}
                onChange={(e) => setFormData({ ...formData, howNationalCanHelp: e.target.value })}
                required
                rows={3}
                placeholder="What specific support do you need? (e.g., funding amount, materials, volunteers)"
                data-testid="input-how-national-can-help"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="details">Additional Details (Optional)</Label>
              <Textarea
                id="details"
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                rows={3}
                placeholder="Any other information that would help with your request..."
                data-testid="input-additional-details"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending} 
                data-testid="button-submit-request"
              >
                {createMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-request"
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
