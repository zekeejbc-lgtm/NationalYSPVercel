import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Stats } from "@shared/schema";

export default function StatsManager() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    projects: 0,
    chapters: 0,
    members: 0,
  });

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"]
  });

  useEffect(() => {
    if (stats) {
      setFormData({
        projects: stats.projects,
        chapters: stats.chapters,
        members: stats.members,
      });
    }
  }, [stats]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("PUT", "/api/stats", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Stats updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update stats",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistics</CardTitle>
        <CardDescription>
          Update the homepage statistics displayed to visitors
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projects">Projects Completed</Label>
              <Input
                id="projects"
                type="number"
                value={formData.projects}
                onChange={(e) => setFormData({ ...formData, projects: parseInt(e.target.value) || 0 })}
                required
                data-testid="input-projects"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapters">Active Chapters</Label>
              <Input
                id="chapters"
                type="number"
                value={formData.chapters}
                onChange={(e) => setFormData({ ...formData, chapters: parseInt(e.target.value) || 0 })}
                required
                data-testid="input-chapters-count"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="members">Youth Members</Label>
              <Input
                id="members"
                type="number"
                value={formData.members}
                onChange={(e) => setFormData({ ...formData, members: parseInt(e.target.value) || 0 })}
                required
                data-testid="input-members"
              />
            </div>
          </div>
          <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-stats">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
