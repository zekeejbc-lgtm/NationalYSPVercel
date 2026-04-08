import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { HomeContent, Stats } from "@shared/schema";

const DEFAULT_HOME_CONTENT = {
  aboutUs:
    "Youth Service Philippines is a youth-centered movement that mobilizes volunteers, chapter leaders, and partners to drive meaningful service in local communities.",
  mission:
    "To equip and inspire young Filipinos to lead sustainable, community-first programs through collaboration, service, and grassroots action.",
  vision:
    "A Philippines where every young person is empowered to become a catalyst of positive change in their chapter, barangay, and beyond.",
  advocacyPillars: [
    "Youth Leadership and Civic Participation",
    "Community Service and Volunteerism",
    "Inclusive Education and Skills Development",
    "Disaster Preparedness and Environmental Stewardship",
  ],
};

export default function HomeEditorManager() {
  const { toast } = useToast();
  const [statsForm, setStatsForm] = useState({
    projects: 0,
    chapters: 0,
    members: 0,
  });
  const [contentForm, setContentForm] = useState({
    aboutUs: DEFAULT_HOME_CONTENT.aboutUs,
    mission: DEFAULT_HOME_CONTENT.mission,
    vision: DEFAULT_HOME_CONTENT.vision,
    advocacyPillarsText: DEFAULT_HOME_CONTENT.advocacyPillars.join("\n"),
  });

  const {
    data: stats,
    isLoading: statsLoading,
    isFetched: statsFetched,
  } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const {
    data: homeContent,
    isLoading: homeContentLoading,
    isFetched: homeContentFetched,
  } = useQuery<HomeContent>({
    queryKey: ["/api/home-content"],
  });

  useEffect(() => {
    if (!stats) {
      return;
    }

    setStatsForm({
      projects: stats.projects,
      chapters: stats.chapters,
      members: stats.members,
    });
  }, [stats]);

  useEffect(() => {
    if (!homeContent) {
      return;
    }

    const pillars =
      Array.isArray(homeContent.advocacyPillars) && homeContent.advocacyPillars.length > 0
        ? homeContent.advocacyPillars
        : [...DEFAULT_HOME_CONTENT.advocacyPillars];

    setContentForm({
      aboutUs: homeContent.aboutUs || DEFAULT_HOME_CONTENT.aboutUs,
      mission: homeContent.mission || DEFAULT_HOME_CONTENT.mission,
      vision: homeContent.vision || DEFAULT_HOME_CONTENT.vision,
      advocacyPillarsText: pillars.join("\n"),
    });
  }, [homeContent]);

  const updateStatsMutation = useMutation({
    mutationFn: async (payload: typeof statsForm) => apiRequest("PUT", "/api/stats", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Homepage stats updated",
        description: "Landing page number cards were saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update stats",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateHomeContentMutation = useMutation({
    mutationFn: async (payload: {
      aboutUs: string;
      mission: string;
      vision: string;
      advocacyPillars: string[];
    }) => apiRequest("PUT", "/api/home-content", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/home-content"] });
      toast({
        title: "Homepage section updated",
        description: "About, Mission, Vision, and advocacy pillars are now updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update homepage section",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStatsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateStatsMutation.mutate({
      projects: Number.isFinite(statsForm.projects) ? Math.max(0, Math.trunc(statsForm.projects)) : 0,
      chapters: Number.isFinite(statsForm.chapters) ? Math.max(0, Math.trunc(statsForm.chapters)) : 0,
      members: Number.isFinite(statsForm.members) ? Math.max(0, Math.trunc(statsForm.members)) : 0,
    });
  };

  const handleContentSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const aboutUs = contentForm.aboutUs.trim();
    const mission = contentForm.mission.trim();
    const vision = contentForm.vision.trim();
    const advocacyPillars = contentForm.advocacyPillarsText
      .split("\n")
      .map((pillar) => pillar.trim())
      .filter(Boolean);

    if (!aboutUs || !mission || !vision) {
      toast({
        title: "Missing required fields",
        description: "About Us, Mission, and Vision are all required.",
        variant: "destructive",
      });
      return;
    }

    if (advocacyPillars.length === 0) {
      toast({
        title: "Advocacy pillars required",
        description: "Add at least one advocacy pillar line.",
        variant: "destructive",
      });
      return;
    }

    updateHomeContentMutation.mutate({
      aboutUs,
      mission,
      vision,
      advocacyPillars,
    });
  };

  const isStatsPending = statsLoading || !statsFetched;
  const isHomeContentPending = homeContentLoading || !homeContentFetched;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Homepage Statistics</CardTitle>
          <CardDescription>
            Manage the public number cards shown on the landing page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isStatsPending ? (
            <LoadingState label="Loading homepage statistics..." rows={1} compact />
          ) : (
            <form onSubmit={handleStatsSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="home-editor-projects">Projects Completed</Label>
                  <Input
                    id="home-editor-projects"
                    type="number"
                    value={statsForm.projects}
                    onChange={(e) =>
                      setStatsForm((previous) => ({
                        ...previous,
                        projects: Number.parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    data-testid="input-home-editor-projects"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="home-editor-chapters">Active Chapters</Label>
                  <Input
                    id="home-editor-chapters"
                    type="number"
                    value={statsForm.chapters}
                    onChange={(e) =>
                      setStatsForm((previous) => ({
                        ...previous,
                        chapters: Number.parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    data-testid="input-home-editor-chapters"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="home-editor-members">Youth Members</Label>
                  <Input
                    id="home-editor-members"
                    type="number"
                    value={statsForm.members}
                    onChange={(e) =>
                      setStatsForm((previous) => ({
                        ...previous,
                        members: Number.parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    data-testid="input-home-editor-members"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateStatsMutation.isPending}
                  data-testid="button-save-home-editor-stats"
                >
                  {updateStatsMutation.isPending ? "Saving..." : "Save Statistics"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who We Are Section</CardTitle>
          <CardDescription>
            Edit About Us, Mission, Vision, and advocacy pillars displayed below the homepage stats cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isHomeContentPending ? (
            <LoadingState label="Loading homepage section content..." rows={2} compact />
          ) : (
            <form onSubmit={handleContentSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="home-editor-about-us">About Us</Label>
                <Textarea
                  id="home-editor-about-us"
                  value={contentForm.aboutUs}
                  onChange={(e) => setContentForm((previous) => ({ ...previous, aboutUs: e.target.value }))}
                  className="min-h-[120px]"
                  data-testid="textarea-home-editor-about-us"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="home-editor-mission">Our Mission</Label>
                <Textarea
                  id="home-editor-mission"
                  value={contentForm.mission}
                  onChange={(e) => setContentForm((previous) => ({ ...previous, mission: e.target.value }))}
                  className="min-h-[120px]"
                  data-testid="textarea-home-editor-mission"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="home-editor-vision">Our Vision</Label>
                <Textarea
                  id="home-editor-vision"
                  value={contentForm.vision}
                  onChange={(e) => setContentForm((previous) => ({ ...previous, vision: e.target.value }))}
                  className="min-h-[120px]"
                  data-testid="textarea-home-editor-vision"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="home-editor-advocacy-pillars">Our Advocacy Pillars</Label>
                <Textarea
                  id="home-editor-advocacy-pillars"
                  value={contentForm.advocacyPillarsText}
                  onChange={(e) =>
                    setContentForm((previous) => ({
                      ...previous,
                      advocacyPillarsText: e.target.value,
                    }))
                  }
                  className="min-h-[160px]"
                  data-testid="textarea-home-editor-advocacy-pillars"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter one advocacy pillar per line.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateHomeContentMutation.isPending}
                  data-testid="button-save-home-editor-content"
                >
                  {updateHomeContentMutation.isPending ? "Saving..." : "Save Home Section"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
