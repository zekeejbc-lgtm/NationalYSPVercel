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
import { ExternalLink, Map, CheckCircle2, Mail, MapPin, Phone, Search, User } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import type { Chapter } from "@shared/schema";

interface MembershipFormData {
  fullName: string;
  age: number;
  birthdate?: string;
  chapterId: string;
  barangayId?: string;
  contactNumber: string;
  facebookLink?: string;
  registeredVoter: boolean;
  householdSize: number;
  householdVoters?: number;
  newsletterOptIn: boolean;
  sector: string;
  sectorOther?: string;
  privacyConsent: boolean;
}

interface BarangayOption {
  id: string;
  barangayName: string;
  chapterId: string;
}

interface PublicChapterDirectoryEntry {
  id: string;
  chapterId: string;
  barangayId: string | null;
  level: string;
  position: string;
  fullName: string;
  contactNumber: string;
  chapterEmail: string;
}

interface PublicBarangayDirectoryEntry {
  id: string;
  chapterId: string;
  barangayName: string;
  presidentName: string | null;
  presidentContactNumber: string | null;
  presidentEmail: string | null;
}

const SECTOR_OPTIONS = [
  "Youth (30 years old and under)",
  "PWD",
  "Farmers",
  "Indigenous People",
  "TODA",
  "Others",
];

const PRIVACY_TEXT = `Privacy Advisory and Data Consent

By submitting this YSP Membership Form, you voluntarily provide personal information and consent to its collection, use, processing, and storage by Youth Service Philippines (YSP). Your information will be used solely for legitimate organizational purposes, including but not limited to:

• Membership registration and verification
• Coordination of youth programs, projects, and activities
• Engagement, communication, and updates related to YSP initiatives
• Monitoring, evaluation, and reporting of youth engagement and impact

YSP may also use aggregated or anonymized data for research, program improvement, advocacy, partnerships, and reporting, provided that such use does not identify you personally.

Your data will not be sold or shared with unauthorized third parties and will be handled in accordance with applicable data privacy laws. Reasonable safeguards are in place to protect your information from unauthorized access, misuse, or disclosure.

By proceeding, you affirm that the information provided is accurate and that you agree to this Privacy Advisory and Data Consent.`;

const WEBSITE_LOGO_SRC = "/images/ysp-logo.png";

function isUnsupportedPhotoUrl(photoUrl: string): boolean {
  const normalized = photoUrl.toLowerCase();
  return normalized.includes("facebook.com/") || normalized.includes("fb.com/");
}

function getChapterLogoSrc(photo?: string | null): string {
  const normalizedPhoto = photo?.trim() || "";
  if (!normalizedPhoto || isUnsupportedPhotoUrl(normalizedPhoto)) {
    return WEBSITE_LOGO_SRC;
  }

  return getDisplayImageUrl(normalizedPhoto);
}

export default function Membership() {
  const { toast } = useToast();
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(undefined);
  const [chapterSearchTerm, setChapterSearchTerm] = useState("");
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isChapterDetailsOpen, setIsChapterDetailsOpen] = useState(false);

  const { data: chapters = [] } = useQuery<Chapter[]>({ 
    queryKey: ["/api/chapters"] 
  });

  const { data: selectedChapterDirectory = [], isLoading: isDirectoryLoading } = useQuery<PublicChapterDirectoryEntry[]>({
    queryKey: ["/api/chapters", selectedChapter?.id, "directory"],
    queryFn: async () => {
      if (!selectedChapter?.id) {
        return [];
      }

      const response = await fetch(`/api/chapters/${selectedChapter.id}/directory`);
      if (!response.ok) {
        return [];
      }

      return response.json();
    },
    enabled: isChapterDetailsOpen && !!selectedChapter?.id,
  });

  const { data: selectedChapterBarangays = [], isLoading: isBarangayDirectoryLoading } = useQuery<PublicBarangayDirectoryEntry[]>({
    queryKey: ["/api/chapters", selectedChapter?.id, "barangay-directory"],
    queryFn: async () => {
      if (!selectedChapter?.id) {
        return [];
      }

      const detailedDirectoryResponse = await fetch(`/api/chapters/${selectedChapter.id}/barangay-directory`);
      if (detailedDirectoryResponse.ok) {
        const responseContentType = (detailedDirectoryResponse.headers.get("content-type") || "").toLowerCase();
        if (responseContentType.includes("application/json")) {
          const detailedDirectoryData = await detailedDirectoryResponse.json();
          if (Array.isArray(detailedDirectoryData)) {
            return detailedDirectoryData as PublicBarangayDirectoryEntry[];
          }
        }
      }

      const barangayListResponse = await fetch(`/api/chapters/${selectedChapter.id}/barangays`);
      if (!barangayListResponse.ok) {
        return [];
      }

      const barangayList = await barangayListResponse.json();
      if (!Array.isArray(barangayList)) {
        return [];
      }

      return barangayList.map((barangay: BarangayOption) => ({
        id: barangay.id,
        chapterId: barangay.chapterId,
        barangayName: barangay.barangayName,
        presidentName: null,
        presidentContactNumber: null,
        presidentEmail: null,
      }));
    },
    enabled: isChapterDetailsOpen && !!selectedChapter?.id,
  });

  const { data: barangays = [] } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", selectedChapterId, "barangays"],
    queryFn: async () => {
      if (!selectedChapterId) return [];
      const res = await fetch(`/api/chapters/${selectedChapterId}/barangays`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const form = useForm<MembershipFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      birthdate: "",
      chapterId: "",
      barangayId: undefined,
      contactNumber: "",
      facebookLink: "",
      registeredVoter: false,
      householdSize: 1,
      householdVoters: undefined,
      newsletterOptIn: false,
      sector: "",
      sectorOther: "",
      privacyConsent: false,
    }
  });

  const watchSector = form.watch("sector");
  const normalizedChapterSearchTerm = chapterSearchTerm.trim().toLowerCase();
  const chapterOnlyDirectoryEntries = selectedChapterDirectory.filter((entry) => {
    const normalizedLevel = (entry.level || "").toLowerCase();
    const normalizedPosition = entry.position.toLowerCase();
    return !entry.barangayId && normalizedLevel !== "barangay" && normalizedPosition.includes("president") && !normalizedPosition.includes("barangay");
  });
  const filteredChapters = chapters.filter((chapter) => {
    if (!normalizedChapterSearchTerm) {
      return true;
    }

    const searchableValues = [
      chapter.name,
      chapter.location,
      chapter.contact,
      chapter.email ?? "",
      chapter.contactPerson ?? "",
    ];

    return searchableValues.some((value) => value.toLowerCase().includes(normalizedChapterSearchTerm));
  });

  const submitMutation = useMutation({
    mutationFn: async (data: MembershipFormData) => {
      const { privacyConsent, ...memberData } = data;
      return await apiRequest("POST", "/api/members", {
        ...memberData,
        birthdate: memberData.birthdate || null,
        barangayId: memberData.barangayId || null,
        householdVoters: memberData.householdVoters || null,
        sectorOther: memberData.sector === "Others" ? memberData.sectorOther : null,
        isActive: false,
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      form.reset();
      setSelectedChapterId(undefined);
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
                        name="birthdate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birthdate</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field} 
                                data-testid="input-public-birthdate" 
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
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedChapterId(value);
                                form.setValue("barangayId", undefined);
                              }} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-public-chapter">
                                  <SelectValue placeholder="Select your chapter" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {chapters.filter(chapter => chapter.id).map((chapter) => (
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

                      {barangays.length > 0 && (
                        <FormField
                          control={form.control}
                          name="barangayId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Barangay (optional)</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-public-barangay">
                                    <SelectValue placeholder="Select your barangay (if applicable)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None / Not Applicable</SelectItem>
                                  {barangays.filter(barangay => barangay.id).map((barangay) => (
                                    <SelectItem key={barangay.id} value={barangay.id}>
                                      {barangay.barangayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

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

                      <div className="border-t pt-4 mt-4">
                        <p className="text-sm text-muted-foreground mb-4 italic">
                          Comprehensive details are collected for our Annual Voter's Education.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="householdSize"
                            rules={{ 
                              required: "Household size is required",
                              min: { value: 1, message: "Must be at least 1" }
                            }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>How many are in your household? *</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={1}
                                    {...field} 
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                    data-testid="input-household-size" 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="householdVoters"
                            rules={{ min: { value: 0, message: "Cannot be negative" } }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>How many registered voters are in your household? (Optional)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min={0}
                                    {...field} 
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                    data-testid="input-household-voters" 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="sector"
                          rules={{ required: "Please select a sector" }}
                          render={({ field }) => (
                            <FormItem className="mt-4">
                              <FormLabel>Sector *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-sector">
                                    <SelectValue placeholder="Select your sector" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {SECTOR_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {watchSector === "Others" && (
                          <FormField
                            control={form.control}
                            name="sectorOther"
                            render={({ field }) => (
                              <FormItem className="mt-4">
                                <FormLabel>Please specify</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter your sector" data-testid="input-sector-other" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <FormField
                          control={form.control}
                          name="newsletterOptIn"
                          render={({ field }) => (
                            <FormItem className="flex items-start gap-3 mt-4 py-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-newsletter"
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 font-normal">
                                Subscribe to our monthly newsletter for volunteer & organization opportunities.
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      </div>

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
            <div className="max-w-xl mx-auto mb-4">
              <div className="relative">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={chapterSearchTerm}
                  onChange={(event) => setChapterSearchTerm(event.target.value)}
                  placeholder="Search chapter by name, location, contact, or email"
                  className="pl-10"
                  data-testid="input-chapter-search"
                />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mb-6" data-testid="text-chapter-search-count">
              Showing {filteredChapters.length} of {chapters.length} chapters
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredChapters.map((chapter) => (
                <ChapterCard
                  key={chapter.id}
                  {...chapter}
                  onSelect={() => {
                    setSelectedChapter(chapter);
                    setIsChapterDetailsOpen(true);
                  }}
                />
              ))}
            </div>
            {filteredChapters.length === 0 && (
              <p className="text-center text-muted-foreground mt-6" data-testid="text-no-chapter-search-results">
                No chapter found. Try a different keyword.
              </p>
            )}

            <Dialog
              open={isChapterDetailsOpen}
              onOpenChange={(open) => {
                setIsChapterDetailsOpen(open);
                if (!open) {
                  setSelectedChapter(null);
                }
              }}
            >
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                {selectedChapter && (
                  <div className="space-y-6">
                    <DialogHeader>
                      <DialogTitle className="text-2xl">{selectedChapter.name}</DialogTitle>
                    </DialogHeader>

                    <div className="flex items-start gap-4">
                      <img
                        src={getChapterLogoSrc(selectedChapter.photo)}
                        alt={`${selectedChapter.name} logo`}
                        className="h-20 w-20 rounded-full border bg-white object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = WEBSITE_LOGO_SRC;
                        }}
                      />
                      <div className="space-y-2 text-sm">
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{selectedChapter.location}</span>
                        </p>
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <a href={`tel:${selectedChapter.contact}`} className="text-primary hover:underline">
                            {selectedChapter.contact}
                          </a>
                        </p>
                        {selectedChapter.email && (
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <a href={`mailto:${selectedChapter.email}`} className="text-primary hover:underline break-all">
                              {selectedChapter.email}
                            </a>
                          </p>
                        )}
                        {selectedChapter.contactPerson && (
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>{selectedChapter.contactPerson}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-lg font-semibold">Chapter Directory</h4>
                      <p className="text-sm text-muted-foreground">
                        Public contact information only. Sensitive personal details are intentionally hidden.
                      </p>

                      {isDirectoryLoading ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-loading-chapter-directory">
                          Loading chapter directory...
                        </p>
                      ) : chapterOnlyDirectoryEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-empty-chapter-directory">
                          No directory entries available yet. Use the chapter contact details above.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {chapterOnlyDirectoryEntries.map((entry) => (
                            <div key={entry.id} className="rounded-lg border p-3 space-y-1" data-testid={`directory-entry-${entry.id}`}>
                              <p className="font-medium">{entry.fullName}</p>
                              <p className="text-sm text-muted-foreground">{entry.position}</p>
                              <p className="text-sm">
                                <a href={`tel:${entry.contactNumber}`} className="text-primary hover:underline">
                                  {entry.contactNumber}
                                </a>
                              </p>
                              <p className="text-sm break-all">
                                <a href={`mailto:${entry.chapterEmail}`} className="text-primary hover:underline">
                                  {entry.chapterEmail}
                                </a>
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-lg font-semibold">Barangay Chapters</h4>
                      <p className="text-sm text-muted-foreground">
                        Barangay chapters under this city chapter and their barangay chapter president.
                      </p>

                      {isBarangayDirectoryLoading ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-loading-barangay-directory">
                          Loading barangay chapters...
                        </p>
                      ) : selectedChapterBarangays.length === 0 ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-empty-barangay-directory">
                          No barangay chapters available for this city chapter yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {selectedChapterBarangays.map((barangayEntry) => (
                            <div key={barangayEntry.id} className="rounded-lg border p-3 space-y-1" data-testid={`barangay-directory-entry-${barangayEntry.id}`}>
                              <p className="font-medium">{barangayEntry.barangayName}</p>
                              {barangayEntry.presidentName ? (
                                <>
                                  <p className="text-sm text-muted-foreground">Barangay Chapter President: {barangayEntry.presidentName}</p>
                                  {barangayEntry.presidentContactNumber && (
                                    <p className="text-sm">
                                      <a href={`tel:${barangayEntry.presidentContactNumber}`} className="text-primary hover:underline">
                                        {barangayEntry.presidentContactNumber}
                                      </a>
                                    </p>
                                  )}
                                  {barangayEntry.presidentEmail && (
                                    <p className="text-sm break-all">
                                      <a href={`mailto:${barangayEntry.presidentEmail}`} className="text-primary hover:underline">
                                        {barangayEntry.presidentEmail}
                                      </a>
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">No barangay chapter president assigned yet.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>
    </div>
  );
}
