import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import ChapterCard from "@/components/ChapterCard";
import ChaptersMap from "@/components/ChaptersMap";
import { ExternalLink, Map, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Chapter } from "@shared/schema";

interface MembershipFormData {
  fullName: string;
  age: number;
  chapterId: string;
  contactNumber: string;
  facebookLink?: string;
  registeredVoter: boolean;
  privacyConsent: boolean;
}

const PRIVACY_TEXT = `Privacy Advisory and Data Consent

By submitting this YSP Membership Form, you voluntarily provide personal information and consent to its collection, use, processing, and storage by Youth Service Philippines (YSP). Your information will be used solely for legitimate organizational purposes, including but not limited to:

• Membership registration and verification
• Coordination of youth programs, projects, and activities
• Engagement, communication, and updates related to YSP initiatives
• Monitoring, evaluation, and reporting of youth engagement and impact

YSP may also use aggregated or anonymized data for research, program improvement, advocacy, partnerships, and reporting, provided that such use does not identify you personally.

Your data will not be sold or shared with unauthorized third parties and will be handled in accordance with applicable data privacy laws. Reasonable safeguards are in place to protect your information from unauthorized access, misuse, or disclosure.

By proceeding, you affirm that the information provided is accurate and that you agree to this Privacy Advisory and Data Consent.`;

export default function Membership() {
  const { toast } = useToast();
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const { data: chapters = [] } = useQuery<Chapter[]>({ 
    queryKey: ["/api/chapters"] 
  });

  const form = useForm<MembershipFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      chapterId: "",
      contactNumber: "",
      facebookLink: "",
      registeredVoter: false,
      privacyConsent: false,
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (data: MembershipFormData) => {
      const { privacyConsent, ...memberData } = data;
      return await apiRequest("POST", "/api/members", {
        ...memberData,
        isActive: false,
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Registration Failed", 
        description: error.message || "There was a problem submitting your membership form. Please try again.", 
        variant: "destructive" 
      });
    }
  });

  const onSubmit = (data: MembershipFormData) => {
    if (!data.privacyConsent) {
      toast({
        title: "Consent Required",
        description: "Please agree to the Privacy Advisory and Data Consent before submitting.",
        variant: "destructive"
      });
      return;
    }
    submitMutation.mutate(data);
  };

  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Join Youth Service Philippines</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Be part of a movement that empowers Filipino youth to create positive change 
              in their communities. Whether you want to become a member or start your own chapter, 
              we welcome you!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            <Card className="hover-elevate transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Become a Member</CardTitle>
                <CardDescription>
                  Join thousands of young Filipinos making a difference. Fill out the form below 
                  to start your journey with YSP.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {showSuccess ? (
                  <div className="text-center py-8 space-y-4">
                    <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                    <h3 className="text-xl font-semibold">Registration Successful!</h3>
                    <p className="text-muted-foreground">
                      Thank you for joining Youth Service Philippines! Your membership application has been submitted.
                      Your chapter will contact you soon about upcoming activities.
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowSuccess(false)}
                      data-testid="button-register-another"
                    >
                      Register Another Member
                    </Button>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="fullName"
                        rules={{ required: "Name is required" }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter your full name" data-testid="input-public-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="age"
                        rules={{ 
                          required: "Age is required",
                          min: { value: 1, message: "Please enter a valid age" }
                        }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                placeholder="Enter your age"
                                data-testid="input-public-age" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="chapterId"
                        rules={{ required: "Please select a chapter" }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Chapter *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-public-chapter">
                                  <SelectValue placeholder="Select your chapter" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {chapters.map((chapter) => (
                                  <SelectItem key={chapter.id} value={chapter.id}>
                                    {chapter.name} - {chapter.location}
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
                              <Input {...field} placeholder="Enter your phone number" data-testid="input-public-contact" />
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
                              <Input {...field} placeholder="https://facebook.com/yourprofile" data-testid="input-public-facebook" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="registeredVoter"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-3 py-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-public-voter"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Are you a registered voter?</FormLabel>
                          </FormItem>
                        )}
                      />

                      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                        <FormField
                          control={form.control}
                          name="privacyConsent"
                          rules={{ required: "You must agree to the Privacy Advisory and Data Consent" }}
                          render={({ field }) => (
                            <FormItem className="flex items-start gap-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-privacy-consent"
                                />
                              </FormControl>
                              <div className="space-y-1">
                                <FormLabel className="!mt-0 font-normal">
                                  I agree to the{" "}
                                  <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
                                    <DialogTrigger asChild>
                                      <button 
                                        type="button" 
                                        className="text-primary hover:underline font-medium"
                                        data-testid="button-view-privacy"
                                      >
                                        Privacy Advisory and Data Consent
                                      </button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                      <DialogHeader>
                                        <DialogTitle>Privacy Advisory and Data Consent</DialogTitle>
                                      </DialogHeader>
                                      <div className="prose prose-sm dark:prose-invert">
                                        <p className="whitespace-pre-line text-sm text-muted-foreground">
                                          {PRIVACY_TEXT}
                                        </p>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </FormLabel>
                                <FormMessage />
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={submitMutation.isPending}
                        data-testid="button-submit-membership"
                      >
                        {submitMutation.isPending ? "Submitting..." : "Submit Membership Application"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Create a Chapter</CardTitle>
                <CardDescription>
                  Want to bring YSP to your community? Start your own chapter and lead youth 
                  service initiatives in your area.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-3">Ready to Start a Chapter?</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Fill out our chapter application form. Our team will review your application 
                    and contact you within 5-7 business days.
                  </p>
                  <a
                    href="https://forms.gle/cWPsgBJKLaQoLuUr8"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                    data-testid="link-create-chapter-form"
                  >
                    Open Chapter Application Form
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm text-muted-foreground italic">
                    <strong>Note:</strong> You will be contacted if your chapter is approved. 
                    We look for passionate leaders committed to making a difference in their communities.
                  </p>
                </div>

                <div className="pt-4">
                  <h4 className="font-semibold mb-3">Chapter Requirements:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Minimum of 10 committed members</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Designated chapter president and officers</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Commitment to organize quarterly service activities</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Active communication with YSP national office</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-3">
                <Map className="h-8 w-8 text-primary" />
                Existing Chapters
              </h2>
              <p className="text-muted-foreground">
                Connect with a YSP chapter near you. Click on map markers to learn more about each chapter.
              </p>
            </div>
            
            <div className="mb-10">
              <ChaptersMap chapters={chapters} />
            </div>
            
            <h3 className="text-xl font-semibold mb-6 text-center">All Chapters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {chapters.map((chapter) => (
                <ChapterCard key={chapter.id} {...chapter} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
