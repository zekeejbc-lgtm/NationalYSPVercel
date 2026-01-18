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
import { Users, Search, Trash2, Mail, Phone, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { Chapter, Member } from "@shared/schema";

export default function MemberListManager() {
  const { toast } = useToast();
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

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
      member.email?.toLowerCase().includes(search) ||
      member.phone?.toLowerCase().includes(search)
    );
  });

  const getChapterName = (chapterId: string | null) => {
    if (!chapterId) return "No Chapter";
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const membersByChapter = chapters.reduce((acc, chapter) => {
    acc[chapter.id] = filteredMembers.filter(m => m.chapterId === chapter.id).length;
    return acc;
  }, {} as Record<string, number>);

  const totalMembers = filteredMembers.length;
  const membersWithoutChapter = filteredMembers.filter(m => !m.chapterId).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Member List
        </CardTitle>
        <CardDescription>
          View and manage all registered YSP members across chapters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{totalMembers}</div>
            <div className="text-sm text-muted-foreground">Total Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{chapters.length}</div>
            <div className="text-sm text-muted-foreground">Active Chapters</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{totalMembers - membersWithoutChapter}</div>
            <div className="text-sm text-muted-foreground">Assigned to Chapters</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{membersWithoutChapter}</div>
            <div className="text-sm text-muted-foreground">Unassigned Members</div>
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
                placeholder="Search by name, email, or phone..."
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
                    {chapter.name} ({membersByChapter[chapter.id] || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="grid grid-cols-12 gap-4 p-4 bg-muted/50 font-medium text-sm">
            <div className="col-span-4">Name</div>
            <div className="col-span-3">Chapter</div>
            <div className="col-span-2">Contact</div>
            <div className="col-span-2">Registered</div>
            <div className="col-span-1">Actions</div>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No members found. {searchTerm && "Try adjusting your search."}
            </div>
          ) : (
            <div className="divide-y">
              {filteredMembers.map((member) => (
                <div key={member.id} className="grid grid-cols-12 gap-4 p-4 items-center hover-elevate">
                  <div className="col-span-4">
                    <div className="font-medium">{member.fullName}</div>
                  </div>
                  <div className="col-span-3">
                    <Badge variant={member.chapterId ? "secondary" : "outline"}>
                      {getChapterName(member.chapterId)}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground space-y-1">
                    {member.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span>{member.phone}</span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(member.createdAt), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="col-span-1">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
