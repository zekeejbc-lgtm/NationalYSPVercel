import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Share2, Save, Facebook, Instagram, ExternalLink } from "lucide-react";
import type { Chapter } from "@shared/schema";

interface SocialMediaPanelProps {
  chapterId: string;
}

export default function SocialMediaPanel({ chapterId }: SocialMediaPanelProps) {
  const { toast } = useToast();
  const [facebookLink, setFacebookLink] = useState("");
  const [instagramLink, setInstagramLink] = useState("");

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", chapterId],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter");
      return res.json();
    },
    enabled: !!chapterId,
  });

  useEffect(() => {
    if (chapter) {
      setFacebookLink(chapter.facebookLink || "");
      setInstagramLink(chapter.instagramLink || "");
    }
  }, [chapter]);

  const updateMutation = useMutation({
    mutationFn: async (data: { facebookLink: string; instagramLink: string }) => {
      return await apiRequest("PUT", `/api/chapters/${chapterId}/social-media`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Social media links updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ facebookLink, instagramLink });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Social Media Links
        </CardTitle>
        <CardDescription>
          Add your chapter's social media pages to increase visibility
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="facebook" className="flex items-center gap-2">
              <Facebook className="h-4 w-4 text-blue-600" />
              Facebook Page URL
            </Label>
            <Input
              id="facebook"
              value={facebookLink}
              onChange={(e) => setFacebookLink(e.target.value)}
              placeholder="https://www.facebook.com/YourChapterPage"
              data-testid="input-facebook-link"
            />
            {facebookLink && (
              <a 
                href={facebookLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Visit Page
              </a>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="instagram" className="flex items-center gap-2">
              <Instagram className="h-4 w-4 text-pink-600" />
              Instagram Page URL
            </Label>
            <Input
              id="instagram"
              value={instagramLink}
              onChange={(e) => setInstagramLink(e.target.value)}
              placeholder="https://www.instagram.com/YourChapterAccount"
              data-testid="input-instagram-link"
            />
            {instagramLink && (
              <a 
                href={instagramLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Visit Page
              </a>
            )}
          </div>

          <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-social">
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Links"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
