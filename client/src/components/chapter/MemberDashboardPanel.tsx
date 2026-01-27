import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Phone, Calendar, Plus, Check, X, Search } from "lucide-react";
import { format } from "date-fns";
import type { Member } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";

export interface MemberDashboardPanelProps {
  chapterId: string;
  chapterName?: string;
  barangayId?: string;
}

interface AddMemberFormData {
  fullName: string;
  age: number;
  birthdate?: string;
  contactNumber: string;
  registeredVoter: boolean;
  facebookLink?: string;
  isActive: boolean;
}

export default function MemberDashboardPanel({ chapterId, chapterName, barangayId }: MemberDashboardPanelProps) {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const form = useForm<AddMemberFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      birthdate: "",
      contactNumber: "",
      registeredVoter: false,
      facebookLink: "",
      isActive: false,
    }
  });

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/members", { chapterId, barangayId }],
    queryFn: async () => {
      let url = `/api/members?chapterId=${chapterId}`;
      if (barangayId) {
        url += `&barangayId=${barangayId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: AddMemberFormData) => {
      return await apiRequest("POST", "/api/members", {
        ...data,
        birthdate: data.birthdate || null,
        chapterId,
        barangayId: barangayId || null,
      });
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

  const filteredMembers = members.filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      member.fullName.toLowerCase().includes(search) ||
      member.contactNumber?.toLowerCase().includes(search)
    );
  });

  const onSubmit = (data: AddMemberFormData) => {
    createMutation.mutate({
      ...data,
      age: Number(data.age),
    });
  };

  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.isActive).length;
  const registeredVoters = members.filter(m => m.registeredVoter).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Member Dashboard
            </CardTitle>
            <CardDescription>
              Manage members for {chapterName}
            </CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-chapter-member">
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Member</DialogTitle>
                <DialogDescription>Add a new member to {chapterName}</DialogDescription>
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
                          <Input {...field} placeholder="Full name" data-testid="input-chapter-member-name" />
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
                            data-testid="input-chapter-member-age" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthdate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birthdate</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            data-testid="input-chapter-member-birthdate" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="bg-muted/50 p-3 rounded-md">
                    <Label className="text-sm font-medium">Chapter</Label>
                    <p className="text-sm text-muted-foreground mt-1">{chapterName}</p>
                    <p className="text-xs text-muted-foreground mt-1">(Auto-filled from your account)</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="contactNumber"
                    rules={{ required: "Contact number is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Phone number" data-testid="input-chapter-member-contact" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="registeredVoter"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-chapter-member-voter"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Registered Voter</FormLabel>
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
                          <Input {...field} placeholder="https://facebook.com/..." data-testid="input-chapter-member-facebook" />
                        </FormControl>
                        <FormMessage />
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
                            data-testid="switch-chapter-member-active"
                          />
                        </FormControl>
                        <div>
                          <FormLabel className="!mt-0">Active</FormLabel>
                          <FormDescription className="text-xs">
                            Active members can participate in up to 2 programs.
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-chapter-member">
                      {createMutation.isPending ? "Adding..." : "Add Member"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-10"
            data-testid="input-search-chapter-members"
          />
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-4 font-medium text-sm">Name</th>
                <th className="text-left p-4 font-medium text-sm">Age</th>
                <th className="text-left p-4 font-medium text-sm">Birthdate</th>
                <th className="text-left p-4 font-medium text-sm">Contact</th>
                <th className="text-center p-4 font-medium text-sm">Registered Voter</th>
                <th className="text-center p-4 font-medium text-sm">Active</th>
                <th className="text-left p-4 font-medium text-sm">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">Loading members...</td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No members found. {searchTerm ? "Try adjusting your search." : "Click 'Add Member' to get started."}
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
                      {member.birthdate ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{member.birthdate}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
                        data-testid={`button-toggle-chapter-voter-${member.id}`}
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
                        data-testid={`button-toggle-chapter-active-${member.id}`}
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

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-medium text-sm ${className || ""}`}>{children}</span>;
}
