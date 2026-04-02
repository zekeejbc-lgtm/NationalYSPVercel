import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { Calendar, Clock, Plus, CheckCircle, XCircle, AlertCircle, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import type { ChapterRequest } from "@shared/schema";

const fundingRequestFormSchema = z.object({
  proposedActivityName: z.string().min(1, "Activity name is required"),
  date: z.string().optional(),
  time: z.string().optional(),
  rationale: z.string().min(1, "Rationale is required"),
  howNationalCanHelp: z.string().min(1, "This field is required"),
  details: z.string().optional(),
});

type FundingRequestFormValues = z.infer<typeof fundingRequestFormSchema>;

interface FundingRequestPanelProps {
  chapterId: string;
}

export default function FundingRequestPanel({ chapterId }: FundingRequestPanelProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<FundingRequestFormValues>({
    resolver: zodResolver(fundingRequestFormSchema),
    defaultValues: {
      proposedActivityName: "",
      date: "",
      time: "",
      rationale: "",
      howNationalCanHelp: "",
      details: "",
    },
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
    mutationFn: (data: FundingRequestFormValues) => 
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
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit request",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: FundingRequestFormValues) => {
    createMutation.mutate(data);
  };

  const requestsPagination = usePagination(requests, {
    pageSize: 5,
    resetKey: requests.length,
  });

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
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading funding requests..." rows={3} compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Funding Requests
              </CardTitle>
              <CardDescription>
                Submit requests for YSP National support for your chapter activities
              </CardDescription>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => setIsDialogOpen(true)} data-testid="button-new-request">
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
              {requestsPagination.paginatedItems.map((request) => (
                <Card key={request.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="w-full min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {getStatusBadge(request.status)}
                        </div>
                        <h3 className="text-base font-semibold leading-tight break-words sm:text-lg">{request.proposedActivityName || "Unnamed Activity"}</h3>
                        {request.date && (
                          <p className="mt-1 flex items-center gap-1 break-words text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(request.date), "MMMM d, yyyy")}
                            {request.time && ` at ${request.time}`}
                          </p>
                        )}
                        {request.rationale && (
                          <div className="mt-3">
                            <p className="text-sm font-medium">Rationale:</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{request.rationale}</p>
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

              <PaginationControls
                currentPage={requestsPagination.currentPage}
                totalPages={requestsPagination.totalPages}
                itemsPerPage={requestsPagination.itemsPerPage}
                totalItems={requestsPagination.totalItems}
                startItem={requestsPagination.startItem}
                endItem={requestsPagination.endItem}
                onPageChange={requestsPagination.setCurrentPage}
                onItemsPerPageChange={requestsPagination.setItemsPerPage}
                itemLabel="requests"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Funding Request</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="proposedActivityName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proposed Activity Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Tree Planting Activity"
                        data-testid="input-activity-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proposed Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          data-testid="input-activity-date"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proposed Time</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 9:00 AM - 12:00 PM"
                          data-testid="input-activity-time"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="rationale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rationale *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Why is this activity important? What are its goals?"
                        data-testid="input-rationale"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="howNationalCanHelp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How Can YSP National Help? *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="What specific support do you need? (e.g., funding amount, materials, volunteers)"
                        data-testid="input-how-national-can-help"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="details"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Details (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Any other information that would help with your request..."
                        data-testid="input-additional-details"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto"
                  disabled={createMutation.isPending} 
                  data-testid="button-submit-request"
                >
                  {createMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full sm:w-auto"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel-request"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
