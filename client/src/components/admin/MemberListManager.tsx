import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Search, Trash2, Phone, Calendar, Download, Plus, Check, X } from "lucide-react";
import { format } from "date-fns";
import type { Chapter, Member } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface AddMemberFormData {
  fullName: string;
  age: number;
  chapterId: string;
  contactNumber: string;
  registeredVoter: boolean;
  facebookLink?: string;
  isActive: boolean;
}

export default function MemberListManager() {
  const { toast } = useToast();
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const form = useForm<AddMemberFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      chapterId: "",
      contactNumber: "",
      registeredVoter: false,
      facebookLink: "",
      isActive: false,
    }
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/members", { chapterId: filterChapter }],
    queryFn: async () => {
      const url = filterChapter && filterChapter !== "all"
        ? `/api/members?chapterId=${filterChapter}`
        : "/api/members";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AddMemberFormData) => {
      return await apiRequest("POST", "/api/members", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Member> }) => {
      setUpdatingMemberId(id);
      return await apiRequest("PATCH", `/api/members/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setUpdatingMemberId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setUpdatingMemberId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/members/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const filteredMembers = members.filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      member.fullName.toLowerCase().includes(search) ||
      member.contactNumber?.toLowerCase().includes(search)
    );
  });

  const getChapterName = (chapterId: string | null) => {
    if (!chapterId) return "No Chapter";
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const handleExportCSV = () => {
    const headers = ["Name", "Age", "Chapter", "Contact Number", "Registered Voter", "Facebook Link", "Active", "Date Added"];
    const rows = filteredMembers.map(member => [
      member.fullName,
      member.age,
      getChapterName(member.chapterId),
      member.contactNumber,
      member.registeredVoter ? "Yes" : "No",
      member.facebookLink || "",
      member.isActive ? "Yes" : "No",
      format(new Date(member.createdAt), "yyyy-MM-dd")
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ysp_members_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Export Complete", description: "Members exported to CSV successfully" });
  };

  const onSubmit = (data: AddMemberFormData) => {
    if (!data.chapterId) {
      toast({ title: "Error", description: "Please select a chapter", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...data,
      age: Number(data.age),
    });
  };

  const totalMembers = filteredMembers.length;
  const activeMembers = filteredMembers.filter(m => m.isActive).length;
  const registeredVoters = filteredMembers.filter(m => m.registeredVoter).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Member List
            </CardTitle>
            <CardDescription>
              View and manage all registered YSP members across chapters
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-member">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Member</DialogTitle>
                  <DialogDescription>Add a new member to Youth Service Philippines</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="fullName"
                      rules={{ required: "Name is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Full name" data-testid="input-member-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="age"
                      rules={{ required: "Age is required", min: { value: 1, message: "Age must be positive" } }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-member-age" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="chapterId"
                      rules={{ required: "Chapter is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chapter *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-member-chapter">
                                <SelectValue placeholder="Select chapter" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {chapters.map((chapter) => (
                                <SelectItem key={chapter.id} value={chapter.id}>
                                  {chapter.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactNumber"
                      rules={{ required: "Contact number is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Number *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Phone number" data-testid="input-member-contact" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="facebookLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facebook Link (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://facebook.com/..." data-testid="input-member-facebook" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-6">
                      <FormField
                        control={form.control}
                        name="registeredVoter"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-member-voter"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Registered Voter</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-member-active"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Active</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-member">
                        {createMutation.isPending ? "Adding..." : "Add Member"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{totalMembers}</div>
            <div className="text-sm text-muted-foreground">Total Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{activeMembers}</div>
            <div className="text-sm text-muted-foreground">Active Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{registeredVoters}</div>
            <div className="text-sm text-muted-foreground">Registered Voters</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{chapters.length}</div>
            <div className="text-sm text-muted-foreground">Active Chapters</div>
          </Card>
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label>Search Members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or phone..."
                className="pl-10"
                data-testid="input-search-members"
              />
            </div>
          </div>
          <div className="w-64">
            <Label>Filter by Chapter</Label>
            <Select value={filterChapter} onValueChange={setFilterChapter}>
              <SelectTrigger data-testid="select-filter-chapter">
                <SelectValue placeholder="All Chapters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chapters</SelectItem>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-4 font-medium text-sm">Name</th>
                <th className="text-left p-4 font-medium text-sm">Age</th>
                <th className="text-left p-4 font-medium text-sm">Chapter</th>
                <th className="text-left p-4 font-medium text-sm">Contact</th>
                <th className="text-center p-4 font-medium text-sm">Registered Voter</th>
                <th className="text-center p-4 font-medium text-sm">Active</th>
                <th className="text-left p-4 font-medium text-sm">Date Added</th>
                <th className="text-center p-4 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">Loading members...</td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No members found. {searchTerm && "Try adjusting your search."}
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className="border-t hover-elevate">
                    <td className="p-4">
                      <div className="font-medium">{member.fullName}</div>
                      {member.facebookLink && (
                        <a 
                          href={member.facebookLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Facebook Profile
                        </a>
                      )}
                    </td>
                    <td className="p-4">{member.age}</td>
                    <td className="p-4">
                      <Badge variant="secondary">
                        {getChapterName(member.chapterId)}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{member.contactNumber}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        size="sm"
                        variant={member.registeredVoter ? "default" : "outline"}
                        onClick={() => updateMutation.mutate({ 
                          id: member.id, 
                          data: { registeredVoter: !member.registeredVoter } 
                        })}
                        disabled={updatingMemberId === member.id}
                        data-testid={`button-toggle-voter-${member.id}`}
                      >
                        {member.registeredVoter ? (
                          <><Check className="h-3 w-3 mr-1" /> Yes</>
                        ) : (
                          <><X className="h-3 w-3 mr-1" /> No</>
                        )}
                      </Button>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        size="sm"
                        variant={member.isActive ? "default" : "outline"}
                        onClick={() => updateMutation.mutate({ 
                          id: member.id, 
                          data: { isActive: !member.isActive } 
                        })}
                        disabled={updatingMemberId === member.id}
                        data-testid={`button-toggle-active-${member.id}`}
                      >
                        {member.isActive ? (
                          <><Check className="h-3 w-3 mr-1" /> Yes</>
                        ) : (
                          <><X className="h-3 w-3 mr-1" /> No</>
                        )}
                      </Button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(member.createdAt), "MMM d, yyyy")}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this member?")) {
                            deleteMutation.mutate(member.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-member-${member.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
