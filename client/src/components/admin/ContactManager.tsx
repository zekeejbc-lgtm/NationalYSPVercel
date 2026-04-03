import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ContactInfo } from "@shared/schema";

export default function ContactManager() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    facebook: "",
  });

  const { data: contactInfo, isLoading } = useQuery<ContactInfo>({
    queryKey: ["/api/contact-info"]
  });

  useEffect(() => {
    if (contactInfo) {
      setFormData({
        email: contactInfo.email,
        phone: contactInfo.phone,
        facebook: contactInfo.facebook,
      });
    }
  }, [contactInfo]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("PUT", "/api/contact-info", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-info"] });
      toast({
        title: "Success",
        description: "Contact information updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update contact info",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return <LoadingState label="Loading contact information..." rows={1} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
        <CardDescription>
          Update the organization's contact details displayed on the website
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              data-testid="input-contact-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              data-testid="input-contact-phone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook Page URL</Label>
            <Input
              id="facebook"
              type="url"
              value={formData.facebook}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              required
              data-testid="input-contact-facebook"
            />
          </div>
          <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-contact">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
