import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserCheck, Plus, Save, Trash2, Edit2, Phone, Mail } from "lucide-react";
import type { ChapterOfficer } from "@shared/schema";

const OFFICER_POSITIONS = [
  "City/Municipality President",
  "Program Development Officer",
  "Finance and Treasury Officer",
  "Secretary and Documentation Officer",
  "Partnership and Fundraising Officer",
  "Communications and Marketing Officer"
];

interface OfficersPanelProps {
  chapterId: string;
}

export default function OfficersPanel({ chapterId }: OfficersPanelProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    position: "",
    fullName: "",
    contactNumber: "",
    chapterEmail: ""
  });

  const { data: officers = [], isLoading } = useQuery<ChapterOfficer[]>({
    queryKey: ["/api/chapter-officers", { chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/chapter-officers?chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch officers");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/chapter-officers", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/chapter-officers/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/chapter-officers/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ position: "", fullName: "", contactNumber: "", chapterEmail: "" });
  };

  const handleEdit = (officer: ChapterOfficer) => {
    setEditingId(officer.id);
    setFormData({
      position: officer.position,
      fullName: officer.fullName,
      contactNumber: officer.contactNumber,
      chapterEmail: officer.chapterEmail
    });
    setIsAdding(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.position || !formData.fullName || !formData.contactNumber || !formData.chapterEmail) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filledPositions = officers.map(o => o.position);
  const availablePositions = OFFICER_POSITIONS.filter(p => !filledPositions.includes(p) || (editingId && officers.find(o => o.id === editingId)?.position === p));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Chapter Officers
        </CardTitle>
        <CardDescription>
          Manage your chapter's officers. All positions are required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant={officers.length === OFFICER_POSITIONS.length ? "default" : "outline"}>
            {officers.length} / {OFFICER_POSITIONS.length} positions filled
          </Badge>
          {!isAdding && officers.length < OFFICER_POSITIONS.length && (
            <Button onClick={() => setIsAdding(true)} data-testid="button-add-officer">
              <Plus className="h-4 w-4 mr-2" />
              Add Officer
            </Button>
          )}
        </div>

        {isAdding && (
          <Card className="border-primary">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Position *</Label>
                    <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                      <SelectTrigger data-testid="select-officer-position">
                        <SelectValue placeholder="Select position..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePositions.map((position) => (
                          <SelectItem key={position} value={position}>{position}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Enter full name"
                      data-testid="input-officer-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Number *</Label>
                    <Input
                      value={formData.contactNumber}
                      onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                      placeholder="e.g., 09171234567"
                      data-testid="input-officer-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chapter Email *</Label>
                    <Input
                      type="email"
                      value={formData.chapterEmail}
                      onChange={(e) => setFormData({ ...formData, chapterEmail: e.target.value })}
                      placeholder="e.g., chapter@ysp.org"
                      data-testid="input-officer-email"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-officer">
                    <Save className="h-4 w-4 mr-2" />
                    {editingId ? "Update" : "Add"} Officer
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-center text-muted-foreground py-4">Loading officers...</p>
        ) : officers.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No officers added yet. Click "Add Officer" to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {officers.map((officer) => (
              <div key={officer.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{officer.fullName}</span>
                    <Badge variant="secondary">{officer.position}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {officer.contactNumber}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {officer.chapterEmail}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(officer)} data-testid={`button-edit-officer-${officer.id}`}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => {
                      if (confirm("Remove this officer?")) {
                        deleteMutation.mutate(officer.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-officer-${officer.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {officers.length < OFFICER_POSITIONS.length && officers.length > 0 && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Missing Positions:</h4>
            <div className="flex flex-wrap gap-2">
              {OFFICER_POSITIONS.filter(p => !filledPositions.includes(p)).map((position) => (
                <Badge key={position} variant="outline">{position}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
