import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/ui/loading-state";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
  Copy,
  Edit,
  Key,
  MapPin,
  Plus,
  Search,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { getComparisonColor } from "@/lib/chartColors";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import type { BarangayUser, Chapter, ChapterOfficer, ChapterUser, Member } from "@shared/schema";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

type AccountType = "Chapter" | "Barangay";

interface ManagedAccount {
  id: string;
  accountType: AccountType;
  accountName: string;
  username: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | Date | null;
  passwordChangedAt: string | Date | null;
  createdAt: string | Date;
}

const emptyChapterForm = {
  name: "",
  location: "",
  contact: "",
  contactPerson: "",
  email: "",
  facebookLink: "",
  nextgenBatch: "",
  photo: "",
  latitude: "",
  longitude: "",
};

const CITY_OFFICER_POSITIONS = [
  "City/Municipality President",
  "Program Development Officer",
  "Finance and Treasury Officer",
  "Secretary and Documentation Officer",
  "Partnership and Fundraising Officer",
  "Communications and Marketing Officer",
  "Membership and Internal Affairs Officer",
];

type CityOfficerDirectoryEntry = {
  id: string;
  position: string;
  fullName: string;
  contactNumber: string | null;
  chapterEmail: string | null;
  isFallbackPresident?: boolean;
  memberProfile: Member | null;
};

function isAccountLocked(account: ManagedAccount) {
  if (!account.lockedUntil) {
    return false;
  }

  return new Date(account.lockedUntil) > new Date();
}

function formatOptionalDate(dateValue: string | Date | null) {
  if (!dateValue) {
    return "Never";
  }

  return new Date(dateValue).toLocaleDateString();
}

function normalizeOfficerPosition(position: string) {
  return position === "Barangay President" ? "City/Municipality President" : position;
}

function normalizePersonName(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ParsedMemberProfile = {
  displayName: string;
  parsedBirthdate: string | null;
  parsedContactNumber: string | null;
};

function parseMemberProfileFromFullName(rawFullName: string): ParsedMemberProfile {
  const normalized = (rawFullName || "").replace(/\s+/g, " ").trim();
  const hasEmbeddedMetadata = /\b(name|age|birthdate|contact(?:\s*number)?)\s*:/i.test(normalized);

  if (!hasEmbeddedMetadata) {
    return {
      displayName: normalized,
      parsedBirthdate: null,
      parsedContactNumber: null,
    };
  }

  const nameMatch = normalized.match(/\bname\s*:\s*(.+?)(?=\s+\b(?:age|birthdate|contact(?:\s*number)?)\s*:|$)/i);
  const birthdateMatch = normalized.match(/\bbirthdate\s*:\s*(.+?)(?=\s+\b(?:age|contact(?:\s*number)?)\s*:|$)/i);
  const contactMatch = normalized.match(/\bcontact(?:\s*number)?\s*:\s*(.+?)(?=\s+\b(?:age|birthdate)\s*:|$)/i);

  const fallbackName = normalized
    .replace(/\bname\s*:\s*/i, "")
    .split(/\b(?:age|birthdate|contact(?:\s*number)?)\s*:/i)[0]
    .trim();

  return {
    displayName: (nameMatch?.[1] || fallbackName || normalized || "Unnamed Member").trim(),
    parsedBirthdate: birthdateMatch?.[1]?.trim() || null,
    parsedContactNumber: contactMatch?.[1]?.trim() || null,
  };
}

function formatMemberBirthdate(dateValue: string | Date | null | undefined) {
  if (!dateValue) {
    return "Not set";
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(dateValue);
  }

  return parsedDate.toLocaleDateString();
}

function findLinkedMemberProfile(
  members: Member[],
  officerFullName: string,
  officerContactNumber: string | null,
) {
  const normalizedOfficerName = normalizePersonName(officerFullName);
  const normalizedOfficerContact = (officerContactNumber || "").trim();

  return (
    members.find((member) => {
      const memberContact = (member.contactNumber || "").trim();
      if (normalizedOfficerContact && memberContact && normalizedOfficerContact === memberContact) {
        return true;
      }

      return normalizePersonName(member.fullName) === normalizedOfficerName;
    }) || null
  );
}

type MemberActivityStatus = "active" | "inactive" | "noStatus";

function getMemberActivityStatus(member: Member | null | undefined): MemberActivityStatus {
  const rawStatus = (member as { isActive?: boolean | null } | null | undefined)?.isActive;

  if (rawStatus === true) {
    return "active";
  }

  if (rawStatus === false) {
    return "inactive";
  }

  return "noStatus";
}

function getActivityBadgeConfig(status: MemberActivityStatus) {
  if (status === "active") {
    return { label: "Active", variant: "default" as const };
  }

  if (status === "inactive") {
    return { label: "Inactive", variant: "secondary" as const };
  }

  return { label: "No Status", variant: "outline" as const };
}

type MemberAnalyticsSummary = {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  noStatusMembers: number;
  registeredVoters: number;
  notRegisteredVoters: number;
  statusBarData: Array<{
    label: string;
    active: number;
    inactive: number;
    noStatus: number;
  }>;
  voterBarData: Array<{
    label: string;
    registeredVoters: number;
    notRegisteredVoters: number;
  }>;
};

const memberAnalyticsChartConfig = {
  active: {
    label: "Active",
    color: "hsl(var(--chart-2))",
  },
  inactive: {
    label: "Inactive",
    color: "hsl(var(--chart-5))",
  },
  noStatus: {
    label: "No Status",
    color: "hsl(var(--muted-foreground))",
  },
  registeredVoters: {
    label: "Registered Voter",
    color: "hsl(var(--chart-1))",
  },
  notRegisteredVoters: {
    label: "Not Registered Voter",
    color: "hsl(var(--chart-4))",
  },
  members: {
    label: "Members",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

function buildMemberAnalytics(members: Member[]): MemberAnalyticsSummary {
  const totalMembers = members.length;
  const activeMembers = members.filter((member) => getMemberActivityStatus(member) === "active").length;
  const inactiveMembers = members.filter((member) => getMemberActivityStatus(member) === "inactive").length;
  const noStatusMembers = members.filter((member) => getMemberActivityStatus(member) === "noStatus").length;
  const registeredVoters = members.filter((member) => member.registeredVoter).length;
  const notRegisteredVoters = totalMembers - registeredVoters;

  return {
    totalMembers,
    activeMembers,
    inactiveMembers,
    noStatusMembers,
    registeredVoters,
    notRegisteredVoters,
    statusBarData: [
      {
        label: "Status",
        active: activeMembers,
        inactive: inactiveMembers,
        noStatus: noStatusMembers,
      },
    ],
    voterBarData: [
      {
        label: "Voter",
        registeredVoters,
        notRegisteredVoters,
      },
    ],
  };
}

const WEBSITE_LOGO_SRC = "/images/ysp-logo.png";
const CHAPTER_LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const CHAPTER_LOGO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const LOCATION_PICKER_DEFAULT_CENTER: [number, number] = [12.8797, 121.774];
const LOCATION_PICKER_DEFAULT_ZOOM = 6;
const LOCATION_PICKER_FOCUSED_ZOOM = 14;

type NominatimSearchResult = {
  lat: string;
  lon: string;
  display_name?: string;
};

type NominatimReverseResult = {
  display_name?: string;
};

function isUnsupportedPhotoUrl(photoUrl: string) {
  const normalized = photoUrl.toLowerCase();
  return normalized.includes("facebook.com/") || normalized.includes("fb.com/");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getChapterLogoSrc(photo?: string | null) {
  const normalizedPhoto = photo?.trim() || "";
  if (!normalizedPhoto || isUnsupportedPhotoUrl(normalizedPhoto)) {
    return WEBSITE_LOGO_SRC;
  }

  return getDisplayImageUrl(normalizedPhoto);
}

function createChapterMarkerIcon(logoSrc: string): L.DivIcon {
  const safeLogoSrc = escapeHtmlAttribute(logoSrc);
  const safeFallbackSrc = escapeHtmlAttribute(WEBSITE_LOGO_SRC);

  return L.divIcon({
    className: "ysp-chapter-marker",
    html: `
      <div style="position:relative;width:40px;height:52px;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.28));">
        <svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="display:block;">
          <path d="M20 1C10.6 1 3 8.6 3 18c0 12.3 14.4 29.2 16.2 31.2.4.5 1.2.5 1.6 0C22.6 47.2 37 30.3 37 18 37 8.6 29.4 1 20 1z" fill="#ffffff" stroke="#f97316" stroke-width="2.2" />
          <circle cx="20" cy="19" r="10.7" fill="#ffffff" stroke="#fb923c" stroke-width="1.4" />
        </svg>
        <div style="position:absolute;top:8px;left:9px;width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <img src="${safeLogoSrc}" alt="Chapter logo" style="width:16px;height:16px;object-fit:contain;" onerror="this.onerror=null;this.src='${safeFallbackSrc}';"/>
        </div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -46],
  });
}

const chapterMarkerIconCache = new Map<string, L.DivIcon>();

function getChapterMarkerIcon(photo?: string | null) {
  const logoSrc = getChapterLogoSrc(photo);
  const cachedIcon = chapterMarkerIconCache.get(logoSrc);

  if (cachedIcon) {
    return cachedIcon;
  }

  const icon = createChapterMarkerIcon(logoSrc);
  chapterMarkerIconCache.set(logoSrc, icon);
  return icon;
}

function parseCoordinate(value: string) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isValidLatitude(value: number) {
  return value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return value >= -180 && value <= 180;
}

function toCoordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

async function geocodeLocation(query: string): Promise<NominatimSearchResult | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
  );

  if (!response.ok) {
    throw new Error("Failed to search location");
  }

  const results = (await response.json()) as NominatimSearchResult[];
  return results[0] || null;
}

async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<string | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
  );

  if (!response.ok) {
    throw new Error("Failed to reverse geocode location");
  }

  const result = (await response.json()) as NominatimReverseResult;
  return result.display_name || null;
}

function LocationMapViewportController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: true });

    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [center, zoom, map]);

  return null;
}

function LocationMapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function ChaptersManager() {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();

  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isChapterDialogOpen, setIsChapterDialogOpen] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
  const [isChapterLogoUploading, setIsChapterLogoUploading] = useState(false);
  const [pendingChapterLogoFile, setPendingChapterLogoFile] = useState<File | null>(null);
  const [chapterLogoPreviewUrl, setChapterLogoPreviewUrl] = useState<string | null>(null);
  const [chapterFormData, setChapterFormData] = useState(emptyChapterForm);

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedBarangayId, setSelectedBarangayId] = useState<string | null>(null);
  const [chapterSearchTerm, setChapterSearchTerm] = useState("");
  const [barangaySearchTerm, setBarangaySearchTerm] = useState("");
  const [isLocationSearchPending, setIsLocationSearchPending] = useState(false);
  const [isLocationReverseLookupPending, setIsLocationReverseLookupPending] = useState(false);
  const [locationLookupMessage, setLocationLookupMessage] = useState<string | null>(null);
  const lastReverseLookupCoordinateKeyRef = useRef("");

  const [showCreateChapterUserDialog, setShowCreateChapterUserDialog] = useState(false);
  const [newChapterUsername, setNewChapterUsername] = useState("");
  const [newChapterPassword, setNewChapterPassword] = useState("");

  const [showCreateBarangayDialog, setShowCreateBarangayDialog] = useState(false);
  const [newBarangayName, setNewBarangayName] = useState("");
  const [newBarangayUsername, setNewBarangayUsername] = useState("");
  const [newBarangayPassword, setNewBarangayPassword] = useState("");

  const [selectedAccount, setSelectedAccount] = useState<ManagedAccount | null>(null);
  const [tempPasswordDialog, setTempPasswordDialog] = useState<{ open: boolean; password: string; accountName: string }>({
    open: false,
    password: "",
    accountName: "",
  });
  const [copied, setCopied] = useState(false);

  const { data: chapters = [], isLoading } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) || null,
    [chapters, selectedChapterId],
  );

  const filteredChapters = useMemo(() => {
    const query = chapterSearchTerm.trim().toLowerCase();
    if (!query) {
      return chapters;
    }

    return chapters.filter((chapter) =>
      [chapter.name, chapter.location, chapter.contact, chapter.contactPerson || "", chapter.email || ""]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [chapters, chapterSearchTerm]);

  const chapterLatitudeValue = parseCoordinate(chapterFormData.latitude);
  const chapterLongitudeValue = parseCoordinate(chapterFormData.longitude);
  const hasValidChapterCoordinates =
    chapterLatitudeValue !== null &&
    chapterLongitudeValue !== null &&
    isValidLatitude(chapterLatitudeValue) &&
    isValidLongitude(chapterLongitudeValue);

  const chapterMapCenter = useMemo<[number, number]>(() => {
    if (hasValidChapterCoordinates && chapterLatitudeValue !== null && chapterLongitudeValue !== null) {
      return [chapterLatitudeValue, chapterLongitudeValue];
    }

    return LOCATION_PICKER_DEFAULT_CENTER;
  }, [hasValidChapterCoordinates, chapterLatitudeValue, chapterLongitudeValue]);

  const chapterMapZoom = hasValidChapterCoordinates ? LOCATION_PICKER_FOCUSED_ZOOM : LOCATION_PICKER_DEFAULT_ZOOM;
  const chapterMapMarkerIcon = useMemo(() => getChapterMarkerIcon(chapterFormData.photo), [chapterFormData.photo]);

  useEffect(() => {
    return () => {
      if (chapterLogoPreviewUrl) {
        URL.revokeObjectURL(chapterLogoPreviewUrl);
      }
    };
  }, [chapterLogoPreviewUrl]);

  const { data: chapterUsers = [], isLoading: chapterUsersLoading } = useQuery<ChapterUser[]>({
    queryKey: ["/api/chapters", selectedChapterId, "users"],
    queryFn: async () => {
      const response = await fetch(`/api/chapters/${encodeURIComponent(selectedChapterId || "")}/users`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load chapter users");
      }
      return response.json();
    },
    enabled: Boolean(selectedChapterId),
  });

  const { data: barangayUsers = [], isLoading: barangayUsersLoading } = useQuery<BarangayUser[]>({
    queryKey: ["/api/chapters", selectedChapterId, "barangay-users"],
    queryFn: async () => {
      const response = await fetch(`/api/chapters/${encodeURIComponent(selectedChapterId || "")}/barangay-users`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load barangay accounts");
      }
      return response.json();
    },
    enabled: Boolean(selectedChapterId),
  });

  const { data: chapterOfficers = [], isLoading: chapterOfficersLoading } = useQuery<ChapterOfficer[]>({
    queryKey: ["/api/chapter-officers", { chapterId: selectedChapterId }],
    queryFn: async () => {
      const response = await fetch(`/api/chapter-officers?chapterId=${encodeURIComponent(selectedChapterId || "")}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load chapter directory");
      }
      return response.json();
    },
    enabled: Boolean(selectedChapterId),
  });

  const { data: chapterMembers = [], isLoading: chapterMembersLoading } = useQuery<Member[]>({
    queryKey: ["/api/members", { chapterId: selectedChapterId }],
    queryFn: async () => {
      const response = await fetch(`/api/members?chapterId=${encodeURIComponent(selectedChapterId || "")}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load chapter members");
      }
      return response.json();
    },
    enabled: Boolean(selectedChapterId),
  });

  const selectedBarangay = useMemo(
    () => barangayUsers.find((barangay) => barangay.id === selectedBarangayId) || null,
    [barangayUsers, selectedBarangayId],
  );

  const { data: barangayOfficers = [], isLoading: barangayOfficersLoading } = useQuery<ChapterOfficer[]>({
    queryKey: ["/api/chapter-officers", { chapterId: selectedChapterId, barangayId: selectedBarangayId, level: "barangay" }],
    queryFn: async () => {
      const params = new URLSearchParams({
        chapterId: selectedChapterId || "",
        barangayId: selectedBarangayId || "",
        level: "barangay",
      });
      const response = await fetch(`/api/chapter-officers?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load barangay officers");
      }
      return response.json();
    },
    enabled: Boolean(selectedChapterId && selectedBarangayId),
  });

  const cityOfficerEntries = useMemo<CityOfficerDirectoryEntry[]>(() => {
    const chapterLevelOfficers = chapterOfficers.filter((officer) => officer.level !== "barangay" && !officer.barangayId);

    const entries: CityOfficerDirectoryEntry[] = chapterLevelOfficers.map((officer) => ({
      id: officer.id,
      position: officer.position,
      fullName: officer.fullName,
      contactNumber: officer.contactNumber || null,
      chapterEmail: officer.chapterEmail || null,
      memberProfile: findLinkedMemberProfile(chapterMembers, officer.fullName, officer.contactNumber || null),
    }));

    const hasCityPresident = entries.some(
      (entry) => normalizeOfficerPosition(entry.position) === "City/Municipality President",
    );

    if (!hasCityPresident && selectedChapter?.contactPerson?.trim()) {
      entries.unshift({
        id: `chapter-profile-president-${selectedChapter.id}`,
        position: "City/Municipality President",
        fullName: selectedChapter.contactPerson.trim(),
        contactNumber: selectedChapter.contact || null,
        chapterEmail: selectedChapter.email || null,
        isFallbackPresident: true,
        memberProfile: findLinkedMemberProfile(
          chapterMembers,
          selectedChapter.contactPerson.trim(),
          selectedChapter.contact || null,
        ),
      });
    }

    return entries;
  }, [chapterOfficers, chapterMembers, selectedChapter]);

  const cityOfficerRows = useMemo(
    () =>
      CITY_OFFICER_POSITIONS.map((position) => ({
        position,
        entries: cityOfficerEntries.filter((entry) => normalizeOfficerPosition(entry.position) === position),
      })),
    [cityOfficerEntries],
  );

  const cityLackingPositions = useMemo(
    () => cityOfficerRows.filter((row) => row.entries.length === 0).map((row) => row.position),
    [cityOfficerRows],
  );

  const cityFilledPositions = CITY_OFFICER_POSITIONS.length - cityLackingPositions.length;

  const barangayMembers = useMemo(() => {
    if (!selectedBarangayId) {
      return [];
    }
    return chapterMembers.filter((member) => member.barangayId === selectedBarangayId);
  }, [chapterMembers, selectedBarangayId]);

  const chapterAccounts = useMemo<ManagedAccount[]>(() => {
    if (!selectedChapter) {
      return [];
    }

    return chapterUsers.map((user) => ({
      id: user.id,
      accountType: "Chapter",
      accountName: selectedChapter.name,
      username: user.username,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      failedLoginAttempts: user.failedLoginAttempts || 0,
      lockedUntil: user.lockedUntil,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
    }));
  }, [chapterUsers, selectedChapter]);

  const barangayAccounts = useMemo<ManagedAccount[]>(
    () =>
      barangayUsers.map((user) => ({
        id: user.id,
        accountType: "Barangay",
        accountName: user.barangayName,
        username: user.username,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        failedLoginAttempts: user.failedLoginAttempts || 0,
        lockedUntil: user.lockedUntil,
        passwordChangedAt: user.passwordChangedAt,
        createdAt: user.createdAt,
      })),
    [barangayUsers],
  );

  const filteredBarangayAccounts = useMemo(() => {
    const query = barangaySearchTerm.trim().toLowerCase();
    if (!query) {
      return barangayAccounts;
    }

    return barangayAccounts.filter((barangay) =>
      [barangay.accountName, barangay.username].some((value) => value.toLowerCase().includes(query)),
    );
  }, [barangayAccounts, barangaySearchTerm]);

  const selectedBarangayAccounts = useMemo(() => {
    if (!selectedBarangay) {
      return [] as ManagedAccount[];
    }

    return barangayAccounts.filter(
      (account) => account.id === selectedBarangay.id || account.accountName === selectedBarangay.barangayName,
    );
  }, [barangayAccounts, selectedBarangay]);

  const chapterMemberAnalytics = useMemo(() => buildMemberAnalytics(chapterMembers), [chapterMembers]);
  const barangayMemberAnalytics = useMemo(() => buildMemberAnalytics(barangayMembers), [barangayMembers]);

  const chapterMembersPerBarangay = useMemo(() => {
    const countByBarangayId = new Map<string, number>();
    const knownBarangayIds = new Set(barangayUsers.map((barangay) => barangay.id));
    let noBarangayMembers = 0;
    let otherBarangayMembers = 0;

    chapterMembers.forEach((member) => {
      const memberBarangayId = (member.barangayId || "").trim();

      if (!memberBarangayId) {
        noBarangayMembers += 1;
        return;
      }

      if (!knownBarangayIds.has(memberBarangayId)) {
        otherBarangayMembers += 1;
        return;
      }

      countByBarangayId.set(memberBarangayId, (countByBarangayId.get(memberBarangayId) || 0) + 1);
    });

    const rows = barangayUsers
      .map((barangay) => ({
        barangay: barangay.barangayName,
        members: countByBarangayId.get(barangay.id) || 0,
      }))
      .filter((row) => row.members > 0);

    if (otherBarangayMembers > 0) {
      rows.push({ barangay: "Other Barangay", members: otherBarangayMembers });
    }

    if (noBarangayMembers > 0) {
      rows.push({ barangay: "No Barangay", members: noBarangayMembers });
    }

    return rows.sort((left, right) => right.members - left.members);
  }, [chapterMembers, barangayUsers]);

  const invalidateChapterWorkspace = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
    queryClient.invalidateQueries({ queryKey: ["/api/chapters", selectedChapterId, "users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/chapters", selectedChapterId, "barangay-users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/all-accounts"] });
  };

  const clearPendingChapterLogoSelection = () => {
    setPendingChapterLogoFile(null);
    setChapterLogoPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
  };

  const handleChapterDialogOpenChange = (open: boolean) => {
    setIsChapterDialogOpen(open);

    if (!open) {
      clearPendingChapterLogoSelection();
      setIsChapterLogoUploading(false);
    }
  };

  const createChapterMutation = useMutation({
    mutationFn: (data: typeof chapterFormData) => apiRequest("POST", "/api/chapters", data),
  });

  const updateChapterMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof chapterFormData }) => apiRequest("PUT", `/api/chapters/${id}`, data),
  });

  const deleteChapterMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/chapters/${id}`),
    onSuccess: (_, deletedChapterId) => {
      setDeletingChapterId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
      toast({ title: "Success", description: "Chapter deleted successfully" });
      if (selectedChapterId && selectedChapterId === deletedChapterId) {
        setSelectedChapterId(null);
        setSelectedBarangayId(null);
      }
    },
    onError: (error: any) => {
      setDeletingChapterId(null);
      toast({ title: "Error", description: error?.message || "Failed to delete chapter", variant: "destructive" });
    },
  });

  const createChapterUserMutation = useMutation({
    mutationFn: (data: { chapterId: string; username: string; password: string }) =>
      apiRequest("POST", "/api/chapter-users", {
        ...data,
        isActive: true,
        mustChangePassword: true,
      }),
    onSuccess: () => {
      invalidateChapterWorkspace();
      toast({ title: "Success", description: "Chapter account created successfully" });
      setShowCreateChapterUserDialog(false);
      setNewChapterUsername("");
      setNewChapterPassword("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create chapter account", variant: "destructive" });
    },
  });

  const createBarangayUserMutation = useMutation({
    mutationFn: (data: { chapterId: string; barangayName: string; username: string; password: string }) =>
      apiRequest("POST", "/api/barangay-users", {
        ...data,
        isActive: true,
        mustChangePassword: true,
      }),
    onSuccess: () => {
      invalidateChapterWorkspace();
      toast({ title: "Success", description: "Barangay account created successfully" });
      setShowCreateBarangayDialog(false);
      setNewBarangayName("");
      setNewBarangayUsername("");
      setNewBarangayPassword("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create barangay account", variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ accountType, id, data }: { accountType: AccountType; id: string; data: Record<string, unknown> }) => {
      const endpoint = accountType === "Chapter" ? `/api/chapter-users/${id}` : `/api/barangay-users/${id}`;
      return apiRequest("PUT", endpoint, data);
    },
    onSuccess: () => {
      invalidateChapterWorkspace();
      toast({ title: "Success", description: "Account updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update account", variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: ({ accountType, id }: { accountType: AccountType; id: string }) => {
      const endpoint = accountType === "Chapter" ? `/api/chapter-users/${id}` : `/api/barangay-users/${id}`;
      return apiRequest("DELETE", endpoint);
    },
    onSuccess: (_, variables) => {
      invalidateChapterWorkspace();
      toast({ title: "Success", description: "Account deleted successfully" });
      if (selectedAccount?.id === variables.id) {
        setSelectedAccount(null);
      }
      if (selectedBarangayId === variables.id) {
        setSelectedBarangayId(null);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete account", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ accountType, id }: { accountType: AccountType; id: string }) =>
      apiRequest("POST", `/api/reset-password/${accountType.toLowerCase()}/${id}`),
    onSuccess: (data: any, variables) => {
      const accountName =
        variables.accountType === "Chapter"
          ? chapterAccounts.find((account) => account.id === variables.id)?.accountName
          : barangayAccounts.find((account) => account.id === variables.id)?.accountName;

      setTempPasswordDialog({
        open: true,
        password: data.temporaryPassword,
        accountName: accountName || "Selected account",
      });
      invalidateChapterWorkspace();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to reset password", variant: "destructive" });
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: ({ accountType, id }: { accountType: AccountType; id: string }) =>
      apiRequest("POST", `/api/unlock-account/${accountType.toLowerCase()}/${id}`),
    onSuccess: () => {
      invalidateChapterWorkspace();
      toast({ title: "Success", description: "Account unlocked successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to unlock account", variant: "destructive" });
    },
  });

  const uploadChapterLogo = async (chapterId: string, logoFile: File) => {
    const formData = new FormData();
    formData.append("logo", logoFile);

    const response = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/logo`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const responseText = await response.text();
    let payload: {
      url?: string;
      photo?: string;
      logoUrl?: string;
      error?: string;
      chapter?: {
        photo?: string | null;
        logoUrl?: string | null;
      };
    } = {};

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || responseText || "Failed to upload chapter logo");
    }

    const resolvedLogoUrl =
      payload.url?.trim() ||
      payload.photo?.trim() ||
      payload.logoUrl?.trim() ||
      payload.chapter?.photo?.trim() ||
      payload.chapter?.logoUrl?.trim() ||
      "";

    if (!resolvedLogoUrl) {
      const normalizedResponseText = responseText.trimStart().toLowerCase();
      const isHtmlResponse =
        normalizedResponseText.startsWith("<!doctype") ||
        normalizedResponseText.startsWith("<html");

      if (isHtmlResponse) {
        throw new Error("Logo upload API is not active yet. Restart npm run dev, then try again.");
      }

      throw new Error("Upload succeeded but no logo URL was returned");
    }

    return resolvedLogoUrl;
  };

  const handleChapterLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const logoFile = event.target.files?.[0];
    event.target.value = "";

    if (!logoFile) {
      return;
    }

    const normalizedMimeType = (logoFile.type || "").toLowerCase();
    if (!CHAPTER_LOGO_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
      toast({
        title: "Error",
        description: "Only JPG, PNG, GIF, and WEBP images are allowed.",
        variant: "destructive",
      });
      return;
    }

    if (logoFile.size > CHAPTER_LOGO_MAX_SIZE_BYTES) {
      toast({
        title: "Error",
        description: "Chapter logo must be 5MB or less.",
        variant: "destructive",
      });
      return;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setPendingChapterLogoFile(logoFile);
    setChapterLogoPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }

      return previewUrl;
    });
  };

  const handleMapCoordinateSelect = (latitude: number, longitude: number) => {
    setLocationLookupMessage(null);
    setChapterFormData((current) => ({
      ...current,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
  };

  const handleSearchLocationOnMap = async () => {
    const query = chapterFormData.location.trim();
    if (!query) {
      setLocationLookupMessage("Enter a location first, then press Search Location.");
      return;
    }

    setIsLocationSearchPending(true);
    setLocationLookupMessage(null);

    try {
      const result = await geocodeLocation(query);
      if (!result) {
        setLocationLookupMessage("No matching location found. Try a more specific location.");
        return;
      }

      const nextLatitude = Number.parseFloat(result.lat);
      const nextLongitude = Number.parseFloat(result.lon);
      if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
        setLocationLookupMessage("Location found, but coordinates are invalid.");
        return;
      }

      lastReverseLookupCoordinateKeyRef.current = toCoordinateKey(nextLatitude, nextLongitude);
      setChapterFormData((current) => ({
        ...current,
        location: result.display_name || current.location,
        latitude: nextLatitude.toFixed(6),
        longitude: nextLongitude.toFixed(6),
      }));
      setLocationLookupMessage("Location found. Pinpoint and coordinates updated.");
    } catch {
      setLocationLookupMessage("Location search failed. Please try again.");
    } finally {
      setIsLocationSearchPending(false);
    }
  };

  useEffect(() => {
    if (!isChapterDialogOpen || !hasValidChapterCoordinates) {
      return;
    }

    const latitude = chapterLatitudeValue as number;
    const longitude = chapterLongitudeValue as number;
    const coordinateKey = toCoordinateKey(latitude, longitude);

    if (lastReverseLookupCoordinateKeyRef.current === coordinateKey) {
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsLocationReverseLookupPending(true);

      try {
        const resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
        if (isCancelled) {
          return;
        }

        if (resolvedLocation) {
          setChapterFormData((current) => ({
            ...current,
            location: resolvedLocation,
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6),
          }));
          setLocationLookupMessage("Location synced from pinpoint.");
        } else {
          setLocationLookupMessage("Pinpoint updated. Could not resolve location text.");
        }

        lastReverseLookupCoordinateKeyRef.current = coordinateKey;
      } catch {
        if (!isCancelled) {
          setLocationLookupMessage("Coordinates saved, but location lookup failed.");
        }
      } finally {
        if (!isCancelled) {
          setIsLocationReverseLookupPending(false);
        }
      }
    }, 600);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    chapterLatitudeValue,
    chapterLongitudeValue,
    hasValidChapterCoordinates,
    isChapterDialogOpen,
  ]);

  const handleAddChapter = () => {
    setEditingChapter(null);
    setChapterFormData(emptyChapterForm);
    clearPendingChapterLogoSelection();
    setIsChapterLogoUploading(false);
    setLocationLookupMessage(null);
    setIsLocationSearchPending(false);
    setIsLocationReverseLookupPending(false);
    lastReverseLookupCoordinateKeyRef.current = "";
    setIsChapterDialogOpen(true);
  };

  const handleEditChapter = (chapter: Chapter) => {
    const parsedLatitude = parseCoordinate(chapter.latitude || "");
    const parsedLongitude = parseCoordinate(chapter.longitude || "");

    if (
      parsedLatitude !== null &&
      parsedLongitude !== null &&
      isValidLatitude(parsedLatitude) &&
      isValidLongitude(parsedLongitude)
    ) {
      lastReverseLookupCoordinateKeyRef.current = toCoordinateKey(parsedLatitude, parsedLongitude);
    } else {
      lastReverseLookupCoordinateKeyRef.current = "";
    }

    setEditingChapter(chapter);
    setChapterFormData({
      name: chapter.name,
      location: chapter.location,
      contact: chapter.contact,
      contactPerson: chapter.contactPerson || "",
      email: chapter.email || "",
      facebookLink: chapter.facebookLink || "",
      nextgenBatch: chapter.nextgenBatch || "",
      photo: chapter.photo || "",
      latitude: chapter.latitude || "",
      longitude: chapter.longitude || "",
    });
    clearPendingChapterLogoSelection();
    setIsChapterLogoUploading(false);
    setLocationLookupMessage(null);
    setIsLocationSearchPending(false);
    setIsLocationReverseLookupPending(false);
    setIsChapterDialogOpen(true);
  };

  const handleSubmitChapter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isChapterLogoUploading) {
      toast({
        title: "Info",
        description: "Please wait for the chapter logo upload to finish.",
      });
      return;
    }

    const shouldUploadLogoOnSave = Boolean(pendingChapterLogoFile);
    if (shouldUploadLogoOnSave) {
      setIsChapterLogoUploading(true);
    }

    const submitData: Record<string, string | undefined> = {
      name: chapterFormData.name,
      location: chapterFormData.location,
      contact: chapterFormData.contact,
      contactPerson: chapterFormData.contactPerson || undefined,
      email: chapterFormData.email || undefined,
      facebookLink: chapterFormData.facebookLink || undefined,
      nextgenBatch: chapterFormData.nextgenBatch || undefined,
      photo: chapterFormData.photo || undefined,
      latitude: chapterFormData.latitude || undefined,
      longitude: chapterFormData.longitude || undefined,
    };

    try {
      let savedChapter: Chapter;

      if (editingChapter) {
        savedChapter = await updateChapterMutation.mutateAsync({
          id: editingChapter.id,
          data: submitData as typeof chapterFormData,
        }) as Chapter;
      } else {
        savedChapter = await createChapterMutation.mutateAsync(submitData as typeof chapterFormData) as Chapter;
      }

      if (shouldUploadLogoOnSave && pendingChapterLogoFile) {
        const uploadedLogoUrl = await uploadChapterLogo(savedChapter.id, pendingChapterLogoFile);
        setChapterFormData((current) => ({
          ...current,
          photo: uploadedLogoUrl,
        }));
      }

      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
      toast({
        title: "Success",
        description: editingChapter ? "Chapter updated successfully" : "Chapter created successfully",
      });
      clearPendingChapterLogoSelection();
      setIsChapterDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || (editingChapter ? "Failed to update chapter" : "Failed to create chapter"),
        variant: "destructive",
      });
    } finally {
      setIsChapterLogoUploading(false);
    }
  };

  const handleDeleteChapter = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this chapter?", "Delete Chapter"))) {
      return;
    }
    setDeletingChapterId(id);
    deleteChapterMutation.mutate(id);
  };

  const handleCreateChapterAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId || !newChapterUsername || !newChapterPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    createChapterUserMutation.mutate({
      chapterId: selectedChapterId,
      username: newChapterUsername,
      password: newChapterPassword,
    });
  };

  const handleCreateBarangayAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId || !newBarangayName || !newBarangayUsername || !newBarangayPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    createBarangayUserMutation.mutate({
      chapterId: selectedChapterId,
      barangayName: newBarangayName,
      username: newBarangayUsername,
      password: newBarangayPassword,
    });
  };

  const handleToggleAccount = (account: ManagedAccount, nextValue: boolean) => {
    setSelectedAccount((current) => (current && current.id === account.id ? { ...current, isActive: nextValue } : current));
    updateAccountMutation.mutate({
      accountType: account.accountType,
      id: account.id,
      data: { isActive: nextValue },
    });
  };

  const handleDeleteAccount = async (account: ManagedAccount) => {
    if (!(await confirmDelete(`Delete ${account.accountType.toLowerCase()} account for ${account.accountName}?`, "Delete Account"))) {
      return;
    }
    deleteAccountMutation.mutate({ accountType: account.accountType, id: account.id });
  };

  const handleCopyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Info", description: "Please copy the password manually" });
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading chapters..." rows={3} compact />;
  }

  return (
    <>
      {!selectedChapterId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Chapters</CardTitle>
                <CardDescription>
                  Manage chapters, city accounts, and barangay accounts in one workflow.
                </CardDescription>
              </div>
              <Button onClick={handleAddChapter} data-testid="button-add-chapter">
                <Plus className="h-4 w-4 mr-2" />
                Add Chapter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {chapters.length === 0 ? (
              <p className="text-muted-foreground">No chapters yet. Add your first chapter.</p>
            ) : (
              <div className="space-y-4">
                <div className="relative max-w-xl">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={chapterSearchTerm}
                    onChange={(event) => setChapterSearchTerm(event.target.value)}
                    placeholder="Search chapter by name, location, contact person, or email"
                    className="pl-9"
                    data-testid="input-search-chapter-workspace"
                  />
                </div>

                {filteredChapters.length === 0 ? (
                  <p className="text-muted-foreground">No chapter matched your search.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredChapters.map((chapter) => (
                      <Card
                        key={chapter.id}
                        className="hover-elevate transition-all cursor-pointer"
                        onClick={() => {
                          setSelectedChapterId(chapter.id);
                          setSelectedBarangayId(null);
                          setBarangaySearchTerm("");
                        }}
                        data-testid={`card-chapter-${chapter.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <Avatar className="h-11 w-11 border shrink-0">
                                <AvatarImage
                                  src={getChapterLogoSrc(chapter.photo)}
                                  alt={`${chapter.name} logo`}
                                />
                                <AvatarFallback>
                                  <img
                                    src={WEBSITE_LOGO_SRC}
                                    alt="YSP national logo"
                                    className="h-full w-full object-contain"
                                  />
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold truncate">{chapter.name}</h3>
                                <p className="text-sm text-muted-foreground truncate">{chapter.location}</p>
                              </div>
                            </div>
                            <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditChapter(chapter)}
                                data-testid={`button-edit-chapter-${chapter.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteChapter(chapter.id)}
                                disabled={deletingChapterId === chapter.id}
                                data-testid={`button-delete-chapter-${chapter.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{chapter.contact}</p>
                            {chapter.contactPerson && <p>{chapter.contactPerson}</p>}
                            {chapter.email && <p>{chapter.email}</p>}
                          </div>
                          <div className="mt-3 text-xs font-medium text-primary">Open Chapter Workspace</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedChapterId && !selectedChapter && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-muted-foreground">The selected chapter no longer exists.</p>
            <Button onClick={() => setSelectedChapterId(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Chapters
            </Button>
          </CardContent>
        </Card>
      )}

      {selectedChapter && !selectedBarangayId && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14 border">
                    <AvatarImage
                      src={getChapterLogoSrc(selectedChapter.photo)}
                      alt={`${selectedChapter.name} logo`}
                    />
                    <AvatarFallback>
                      <img
                        src={WEBSITE_LOGO_SRC}
                        alt="YSP national logo"
                        className="h-full w-full object-contain"
                      />
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <Button variant="ghost" className="px-0" onClick={() => setSelectedChapterId(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Chapters
                    </Button>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {selectedChapter.name}
                    </CardTitle>
                    <CardDescription>{selectedChapter.location}</CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleEditChapter(selectedChapter)} data-testid="button-edit-selected-chapter">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Chapter
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <div className="font-medium break-words">{selectedChapter.contact}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Contact Person</div>
                  <div className="font-medium break-words">{selectedChapter.contactPerson || "Not set"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium break-words">{selectedChapter.email || "Not set"}</div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Chapter Analytics
              </CardTitle>
              <CardDescription>
                Statistical charts for active status and voter status of members under this chapter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chapterMembersLoading ? (
                <LoadingState label="Loading chapter analytics..." rows={2} compact />
              ) : chapterMemberAnalytics.totalMembers === 0 ? (
                <p className="text-muted-foreground">No members available yet for chapter analytics.</p>
              ) : (
                <div className="space-y-4 overflow-x-hidden">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Total Members</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.totalMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.activeMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Inactive</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.inactiveMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">No Status</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.noStatusMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Registered Voter</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.registeredVoters}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Not Registered Voter</p>
                      <p className="text-xl font-semibold">{chapterMemberAnalytics.notRegisteredVoters}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    <div className="border rounded-md p-3 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium mb-2">Members per Barangay</p>
                      {chapterMembersPerBarangay.length === 0 ? (
                        <div className="h-[210px] w-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                          No barangay member data yet.
                        </div>
                      ) : (
                        <ChartContainer config={memberAnalyticsChartConfig} className="h-[260px] w-full min-w-0 aspect-auto">
                          <PieChart>
                            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="barangay" />} />
                            <Pie
                              data={chapterMembersPerBarangay}
                              dataKey="members"
                              nameKey="barangay"
                              innerRadius="42%"
                              outerRadius="80%"
                              paddingAngle={2}
                            >
                              {chapterMembersPerBarangay.map((entry, index) => (
                                <Cell key={`chapter-barangay-pie-${entry.barangay}`} fill={getComparisonColor(index)} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                      )}
                    </div>

                    <div className="border rounded-md p-3 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium mb-2">Activity Status</p>
                      <ChartContainer config={memberAnalyticsChartConfig} className="h-[210px] w-full min-w-0 aspect-auto">
                        <BarChart data={chapterMemberAnalytics.statusBarData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Bar dataKey="active" fill="var(--color-active)" radius={6} maxBarSize={44} />
                          <Bar dataKey="inactive" fill="var(--color-inactive)" radius={6} maxBarSize={44} />
                          <Bar dataKey="noStatus" fill="var(--color-noStatus)" radius={6} maxBarSize={44} />
                        </BarChart>
                      </ChartContainer>
                    </div>

                    <div className="border rounded-md p-3 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium mb-2">Voter vs Not Voter</p>
                      <ChartContainer config={memberAnalyticsChartConfig} className="h-[210px] w-full min-w-0 aspect-auto">
                        <BarChart data={chapterMemberAnalytics.voterBarData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Bar dataKey="registeredVoters" fill="var(--color-registeredVoters)" radius={6} maxBarSize={44} />
                          <Bar dataKey="notRegisteredVoters" fill="var(--color-notRegisteredVoters)" radius={6} maxBarSize={44} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>City Chapter Directory</CardTitle>
                  <CardDescription>
                    Open an account entry to manage Active status, reset password, or delete the account.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setShowCreateChapterUserDialog(true)} data-testid="button-add-city-account">
                  <Users className="h-4 w-4 mr-2" />
                  Add City Account
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {chapterUsersLoading ? (
                <LoadingState label="Loading chapter account directory..." rows={2} compact />
              ) : chapterAccounts.length === 0 ? (
                <p className="text-muted-foreground">No city chapter account yet.</p>
              ) : (
                <div className="space-y-3">
                  {chapterAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{account.accountName}</p>
                          <p className="text-sm text-muted-foreground">Username: {account.username}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Password changed: {formatOptionalDate(account.passwordChangedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={account.isActive ? "default" : "secondary"}>
                            {account.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {account.mustChangePassword && <Badge variant="outline">Must Change Password</Badge>}
                          {isAccountLocked(account) && <Badge variant="destructive">Locked</Badge>}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAccount(account)}
                          data-testid={`button-open-chapter-account-${account.id}`}
                        >
                          Open Panel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            resetPasswordMutation.mutate({
                              accountType: account.accountType,
                              id: account.id,
                            })
                          }
                          disabled={resetPasswordMutation.isPending}
                          data-testid={`button-inline-reset-chapter-account-${account.id}`}
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Reset Password
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteAccount(account)}
                          disabled={deleteAccountMutation.isPending}
                          data-testid={`button-inline-delete-chapter-account-${account.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>City Officer Directory</CardTitle>
              <CardDescription>
                Position-by-position directory with officer info, linked voter or active status (if available), and lacking roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chapterOfficersLoading || chapterMembersLoading ? (
                <LoadingState label="Loading city officer directory..." rows={2} compact />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">
                      {cityFilledPositions === CITY_OFFICER_POSITIONS.length
                        ? "All city officer positions are filled."
                        : `${cityFilledPositions} of ${CITY_OFFICER_POSITIONS.length} city officer positions are filled.`}
                    </p>
                    <Badge variant={cityFilledPositions === CITY_OFFICER_POSITIONS.length ? "default" : "outline"}>
                      {cityFilledPositions}/{CITY_OFFICER_POSITIONS.length}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {cityOfficerRows.map((row) => (
                      <div key={row.position} className="border rounded-lg p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-medium">{row.position}</h4>
                          <Badge variant={row.entries.length > 0 ? "secondary" : "outline"}>
                            {row.entries.length > 0 ? "Filled" : "Vacant"}
                          </Badge>
                        </div>

                        {row.entries.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No officer assigned for this position.</p>
                        ) : (
                          <div className="space-y-3">
                            {row.entries.map((entry) => (
                              <div key={entry.id} className="rounded-md border bg-muted/20 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">{entry.fullName}</p>
                                  {entry.isFallbackPresident && <Badge variant="outline">From Chapter Profile</Badge>}
                                </div>

                                <p className="text-xs text-muted-foreground mt-1">
                                  Contact: {entry.contactNumber || "Not set"} | Email: {entry.chapterEmail || "Not set"}
                                </p>

                                {entry.memberProfile ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {(() => {
                                      const activityBadgeConfig = getActivityBadgeConfig(
                                        getMemberActivityStatus(entry.memberProfile),
                                      );
                                      return <Badge variant={activityBadgeConfig.variant}>{activityBadgeConfig.label}</Badge>;
                                    })()}
                                    <Badge variant={entry.memberProfile.registeredVoter ? "default" : "outline"}>
                                      {entry.memberProfile.registeredVoter ? "Registered Voter" : "Not Registered Voter"}
                                    </Badge>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground mt-2">No linked voter or active member data.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium mb-2">Lacking Positions</p>
                    {cityLackingPositions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No lacking positions.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {cityLackingPositions.map((position) => (
                          <Badge key={position} variant="outline" className="border-destructive/40 text-destructive">
                            {position}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Barangay Chapters</CardTitle>
                  <CardDescription>
                    Open a barangay chapter card to view its officers, members, and account directory.
                  </CardDescription>
                </div>
                <Button onClick={() => setShowCreateBarangayDialog(true)} data-testid="button-add-barangay-account">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Barangay Chapter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {barangayUsersLoading ? (
                <LoadingState label="Loading barangay chapters..." rows={2} compact />
              ) : barangayAccounts.length === 0 ? (
                <p className="text-muted-foreground">No barangay chapters yet for this city chapter.</p>
              ) : (
                <div className="space-y-4">
                  <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={barangaySearchTerm}
                      onChange={(event) => setBarangaySearchTerm(event.target.value)}
                      placeholder="Search barangay by name or username"
                      className="pl-9"
                      data-testid="input-search-barangay-workspace"
                    />
                  </div>

                  {filteredBarangayAccounts.length === 0 ? (
                    <p className="text-muted-foreground">No barangay matched your search.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredBarangayAccounts.map((barangay) => (
                        <Card
                          key={barangay.id}
                          className="hover-elevate transition-all cursor-pointer"
                          onClick={() => setSelectedBarangayId(barangay.id)}
                          data-testid={`card-barangay-${barangay.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  {barangay.accountName}
                                </h4>
                                <p className="text-sm text-muted-foreground">Username: {barangay.username}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Password changed: {formatOptionalDate(barangay.passwordChangedAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={barangay.isActive ? "default" : "secondary"}>
                                  {barangay.isActive ? "Active" : "Inactive"}
                                </Badge>
                                {barangay.mustChangePassword && <Badge variant="outline">Must Change Password</Badge>}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  resetPasswordMutation.mutate({
                                    accountType: barangay.accountType,
                                    id: barangay.id,
                                  });
                                }}
                                disabled={resetPasswordMutation.isPending}
                                data-testid={`button-inline-reset-barangay-account-${barangay.id}`}
                              >
                                <Key className="h-4 w-4 mr-2" />
                                Reset Password
                              </Button>

                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteAccount(barangay);
                                }}
                                disabled={deleteAccountMutation.isPending}
                                data-testid={`button-inline-delete-barangay-account-${barangay.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedChapter && selectedBarangay && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <Button variant="ghost" className="px-0" onClick={() => setSelectedBarangayId(null)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to {selectedChapter.name}
                  </Button>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {selectedBarangay.barangayName}
                  </CardTitle>
                  <CardDescription>{selectedChapter.name}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Barangay Analytics
              </CardTitle>
              <CardDescription>
                Statistical charts for active status and voter status of members under this barangay.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chapterMembersLoading ? (
                <LoadingState label="Loading barangay analytics..." rows={2} compact />
              ) : barangayMemberAnalytics.totalMembers === 0 ? (
                <p className="text-muted-foreground">No members available yet for barangay analytics.</p>
              ) : (
                <div className="space-y-4 overflow-x-hidden">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Total Members</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.totalMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.activeMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Inactive</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.inactiveMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">No Status</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.noStatusMembers}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Registered Voter</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.registeredVoters}</p>
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground">Not Registered Voter</p>
                      <p className="text-xl font-semibold">{barangayMemberAnalytics.notRegisteredVoters}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="border rounded-md p-3 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium mb-2">Activity Status</p>
                      <ChartContainer config={memberAnalyticsChartConfig} className="h-[210px] w-full min-w-0 aspect-auto">
                        <BarChart data={barangayMemberAnalytics.statusBarData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Bar dataKey="active" fill="var(--color-active)" radius={6} maxBarSize={44} />
                          <Bar dataKey="inactive" fill="var(--color-inactive)" radius={6} maxBarSize={44} />
                          <Bar dataKey="noStatus" fill="var(--color-noStatus)" radius={6} maxBarSize={44} />
                        </BarChart>
                      </ChartContainer>
                    </div>

                    <div className="border rounded-md p-3 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium mb-2">Voter vs Not Voter</p>
                      <ChartContainer config={memberAnalyticsChartConfig} className="h-[210px] w-full min-w-0 aspect-auto">
                        <BarChart data={barangayMemberAnalytics.voterBarData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Bar dataKey="registeredVoters" fill="var(--color-registeredVoters)" radius={6} maxBarSize={44} />
                          <Bar dataKey="notRegisteredVoters" fill="var(--color-notRegisteredVoters)" radius={6} maxBarSize={44} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Barangay Account Directory</CardTitle>
              <CardDescription>Press an entry to manage account status, password, and deletion.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBarangayAccounts.length === 0 ? (
                <p className="text-muted-foreground">No account found for this barangay.</p>
              ) : (
                <div className="space-y-3">
                  {selectedBarangayAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{account.accountName}</p>
                          <p className="text-sm text-muted-foreground">Username: {account.username}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Password changed: {formatOptionalDate(account.passwordChangedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={account.isActive ? "default" : "secondary"}>
                            {account.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {account.mustChangePassword && <Badge variant="outline">Must Change Password</Badge>}
                          {isAccountLocked(account) && <Badge variant="destructive">Locked</Badge>}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAccount(account)}
                          data-testid={`button-open-selected-barangay-account-${account.id}`}
                        >
                          Open Panel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            resetPasswordMutation.mutate({
                              accountType: account.accountType,
                              id: account.id,
                            })
                          }
                          disabled={resetPasswordMutation.isPending}
                          data-testid={`button-inline-reset-selected-barangay-account-${account.id}`}
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Reset Password
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteAccount(account)}
                          disabled={deleteAccountMutation.isPending}
                          data-testid={`button-inline-delete-selected-barangay-account-${account.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Barangay Officers</CardTitle>
                <CardDescription>Officer directory for this barangay chapter.</CardDescription>
              </CardHeader>
              <CardContent>
                {barangayOfficersLoading ? (
                  <LoadingState label="Loading barangay officers..." rows={2} compact />
                ) : barangayOfficers.length === 0 ? (
                  <p className="text-muted-foreground">No officers recorded for this barangay.</p>
                ) : (
                  <div className="space-y-3">
                    {barangayOfficers.map((officer) => (
                      <div key={officer.id} className="border rounded-lg p-4">
                        <p className="font-medium">{officer.fullName}</p>
                        <p className="text-sm text-muted-foreground">{officer.position}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Barangay Members</CardTitle>
                <CardDescription>Member directory grouped under this barangay.</CardDescription>
              </CardHeader>
              <CardContent>
                {chapterMembersLoading ? (
                  <LoadingState label="Loading barangay members..." rows={2} compact />
                ) : barangayMembers.length === 0 ? (
                  <p className="text-muted-foreground">No members recorded for this barangay.</p>
                ) : (
                  <div className="space-y-3">
                    {barangayMembers.map((member) => {
                      const parsedProfile = parseMemberProfileFromFullName(member.fullName);
                      const contactNumber = member.contactNumber || parsedProfile.parsedContactNumber || "Not set";
                      const birthdate = member.birthdate
                        ? formatMemberBirthdate(member.birthdate)
                        : parsedProfile.parsedBirthdate || "Not set";
                      const activityBadgeConfig = getActivityBadgeConfig(getMemberActivityStatus(member));

                      return (
                        <div key={member.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="font-semibold leading-tight">{parsedProfile.displayName}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant={activityBadgeConfig.variant}>{activityBadgeConfig.label}</Badge>
                              <Badge variant={member.registeredVoter ? "default" : "outline"}>
                                {member.registeredVoter ? "Registered Voter" : "Not Registered Voter"}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contact</p>
                              <p className="text-sm font-medium break-words">{contactNumber}</p>
                            </div>
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Age</p>
                              <p className="text-sm font-medium">{member.age}</p>
                            </div>
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Birthdate</p>
                              <p className="text-sm font-medium">{birthdate}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={isChapterDialogOpen} onOpenChange={handleChapterDialogOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingChapter ? "Edit Chapter" : "Add New Chapter"}</DialogTitle>
            <DialogDescription>
              Manage chapter details, upload a chapter logo, and adjust chapter location.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitChapter} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Chapter Name</Label>
              <Input
                id="name"
                value={chapterFormData.name}
                onChange={(e) => setChapterFormData({ ...chapterFormData, name: e.target.value })}
                required
                placeholder="YSP Manila"
                data-testid="input-chapter-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Number</Label>
              <Input
                id="contact"
                type="tel"
                value={chapterFormData.contact}
                onChange={(e) => setChapterFormData({ ...chapterFormData, contact: e.target.value })}
                required
                placeholder="09171234567"
                data-testid="input-chapter-contact"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person (Optional)</Label>
              <Input
                id="contactPerson"
                value={chapterFormData.contactPerson}
                onChange={(e) => setChapterFormData({ ...chapterFormData, contactPerson: e.target.value })}
                placeholder="Juan Dela Cruz"
                data-testid="input-chapter-contact-person"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                value={chapterFormData.email}
                onChange={(e) => setChapterFormData({ ...chapterFormData, email: e.target.value })}
                placeholder="manila@youthservice.ph"
                data-testid="input-chapter-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebookLink">Facebook Link (Optional)</Label>
              <Input
                id="facebookLink"
                type="url"
                value={chapterFormData.facebookLink}
                onChange={(e) => setChapterFormData({ ...chapterFormData, facebookLink: e.target.value })}
                placeholder="https://facebook.com/yspmanila"
                data-testid="input-chapter-facebook"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextgenBatch">NextGen Batch (Optional)</Label>
              <Input
                id="nextgenBatch"
                value={chapterFormData.nextgenBatch}
                onChange={(e) => setChapterFormData({ ...chapterFormData, nextgenBatch: e.target.value })}
                placeholder="Batch 1"
                data-testid="input-chapter-batch"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter-logo-upload">Chapter Logo (Optional)</Label>
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                <Avatar className="h-14 w-14 border">
                  <AvatarImage
                    src={chapterLogoPreviewUrl || getChapterLogoSrc(chapterFormData.photo)}
                    alt={`${chapterFormData.name || "Chapter"} logo`}
                  />
                  <AvatarFallback>
                    <img
                      src={WEBSITE_LOGO_SRC}
                      alt="YSP national logo"
                      className="h-full w-full object-contain"
                    />
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-2">
                  <Input
                    id="chapter-logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleChapterLogoUpload}
                    disabled={isChapterLogoUploading}
                    data-testid="input-chapter-logo-upload"
                  />

                  <p className="text-xs text-muted-foreground">
                    {isChapterLogoUploading
                      ? "Uploading chapter logo..."
                      : pendingChapterLogoFile
                        ? "Logo selected. Click Save Chapter to upload and apply this logo."
                        : "Upload only: JPG, PNG, GIF, or WEBP, maximum 5MB. Upload happens when you click Save Chapter."}
                  </p>

                  {pendingChapterLogoFile && (
                    <p className="text-xs text-muted-foreground break-all">
                      Selected file: {pendingChapterLogoFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="location"
                  value={chapterFormData.location}
                  onChange={(e) => {
                    setLocationLookupMessage(null);
                    setChapterFormData({ ...chapterFormData, location: e.target.value });
                  }}
                  required
                  placeholder="Manila, Metro Manila"
                  data-testid="input-chapter-location"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSearchLocationOnMap}
                  disabled={isLocationSearchPending}
                  data-testid="button-search-chapter-location"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isLocationSearchPending ? "Searching..." : "Search Location"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Search a location to auto-drop the pinpoint and fill coordinates.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude (for Map)</Label>
                <Input
                  id="latitude"
                  value={chapterFormData.latitude}
                  onChange={(e) => {
                    setLocationLookupMessage(null);
                    setChapterFormData({ ...chapterFormData, latitude: e.target.value });
                  }}
                  placeholder="14.5995"
                  data-testid="input-chapter-latitude"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude (for Map)</Label>
                <Input
                  id="longitude"
                  value={chapterFormData.longitude}
                  onChange={(e) => {
                    setLocationLookupMessage(null);
                    setChapterFormData({ ...chapterFormData, longitude: e.target.value });
                  }}
                  placeholder="120.9842"
                  data-testid="input-chapter-longitude"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Map Pinpoint</Label>
              <div className="h-[280px] rounded-md border overflow-hidden">
                <MapContainer
                  center={chapterMapCenter}
                  zoom={chapterMapZoom}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationMapViewportController center={chapterMapCenter} zoom={chapterMapZoom} />
                  <LocationMapClickHandler onSelect={handleMapCoordinateSelect} />

                  {hasValidChapterCoordinates && chapterLatitudeValue !== null && chapterLongitudeValue !== null && (
                    <Marker
                      position={[chapterLatitudeValue, chapterLongitudeValue]}
                      icon={chapterMapMarkerIcon}
                      draggable
                      eventHandlers={{
                        dragend: (event) => {
                          const marker = event.target as L.Marker;
                          const position = marker.getLatLng();
                          handleMapCoordinateSelect(position.lat, position.lng);
                        },
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-medium">{chapterFormData.name || "Chapter Pin"}</p>
                          <p>{chapterFormData.location || "Location not set"}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                Click on the map to place the custom pin, or drag the pin to adjust. Latitude, longitude, and location stay synced.
              </p>
              {(isLocationReverseLookupPending || locationLookupMessage) && (
                <p className="text-xs text-muted-foreground">
                  {isLocationReverseLookupPending ? "Syncing location from pinpoint..." : locationLookupMessage}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              You can still manually edit latitude and longitude; the map pin will update automatically.
            </p>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={createChapterMutation.isPending || updateChapterMutation.isPending || isChapterLogoUploading}
                data-testid="button-save-chapter"
              >
                {createChapterMutation.isPending || updateChapterMutation.isPending || isChapterLogoUploading
                  ? "Saving..."
                  : "Save Chapter"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleChapterDialogOpenChange(false)}
                data-testid="button-cancel-chapter"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateChapterUserDialog} onOpenChange={setShowCreateChapterUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create City Chapter Account</DialogTitle>
            <DialogDescription>
              Add a login account for {selectedChapter?.name}. This account will appear in the city chapter directory.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChapterAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chapter-username">Username</Label>
              <Input
                id="chapter-username"
                value={newChapterUsername}
                onChange={(e) => setNewChapterUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter-password">Temporary Password</Label>
              <Input
                id="chapter-password"
                type="text"
                value={newChapterPassword}
                onChange={(e) => setNewChapterPassword(e.target.value)}
                placeholder="Enter temporary password"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateChapterUserDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createChapterUserMutation.isPending}>
                {createChapterUserMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateBarangayDialog} onOpenChange={setShowCreateBarangayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Barangay Chapter Account</DialogTitle>
            <DialogDescription>
              Create a barangay account under {selectedChapter?.name}. This appears as a barangay chapter card.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBarangayAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="barangay-name">Barangay Name</Label>
              <Input
                id="barangay-name"
                value={newBarangayName}
                onChange={(e) => setNewBarangayName(e.target.value)}
                placeholder="e.g., Barangay San Antonio"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barangay-username">Username</Label>
              <Input
                id="barangay-username"
                value={newBarangayUsername}
                onChange={(e) => setNewBarangayUsername(e.target.value)}
                placeholder="e.g., brgy_sanantonio"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barangay-password">Temporary Password</Label>
              <Input
                id="barangay-password"
                type="text"
                value={newBarangayPassword}
                onChange={(e) => setNewBarangayPassword(e.target.value)}
                placeholder="Enter temporary password"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateBarangayDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBarangayUserMutation.isPending}>
                {createBarangayUserMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tempPasswordDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setTempPasswordDialog({ open: false, password: "", accountName: "" });
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary Password Generated</DialogTitle>
            <DialogDescription>
              A new temporary password has been generated for <strong>{tempPasswordDialog.accountName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <Label className="text-sm text-muted-foreground mb-2 block">Temporary Password (shown once only)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-lg font-mono tracking-wider select-all">{tempPasswordDialog.password}</code>
                <Button variant="outline" size="icon" onClick={() => handleCopyPassword(tempPasswordDialog.password)}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setTempPasswordDialog({ open: false, password: "", accountName: "" });
                  setCopied(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(selectedAccount)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAccount(null);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Account Detail</SheetTitle>
            <SheetDescription>
              Manage Active status, password reset, and account deletion.
            </SheetDescription>
          </SheetHeader>

          {selectedAccount && (
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedAccount.accountType}</Badge>
                  <Badge variant={selectedAccount.isActive ? "default" : "secondary"}>
                    {selectedAccount.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {selectedAccount.mustChangePassword && <Badge variant="outline">Must Change Password</Badge>}
                  {isAccountLocked(selectedAccount) && <Badge variant="destructive">Locked</Badge>}
                </div>
                <p className="text-lg font-semibold">{selectedAccount.accountName}</p>
                <p className="text-sm text-muted-foreground">Username: {selectedAccount.username}</p>
                <p className="text-xs text-muted-foreground">
                  Created: {new Date(selectedAccount.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Password changed: {formatOptionalDate(selectedAccount.passwordChangedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Failed login attempts: {selectedAccount.failedLoginAttempts}
                </p>
              </div>

              <div className="flex items-center justify-between border rounded-md p-3">
                <Label htmlFor="selected-account-active">Active</Label>
                <Switch
                  id="selected-account-active"
                  checked={selectedAccount.isActive}
                  onCheckedChange={(checked) => handleToggleAccount(selectedAccount, checked)}
                  disabled={updateAccountMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                {isAccountLocked(selectedAccount) && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      unlockAccountMutation.mutate({
                        accountType: selectedAccount.accountType,
                        id: selectedAccount.id,
                      })
                    }
                    disabled={unlockAccountMutation.isPending}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock Account
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    resetPasswordMutation.mutate({
                      accountType: selectedAccount.accountType,
                      id: selectedAccount.id,
                    })
                  }
                  disabled={resetPasswordMutation.isPending}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => handleDeleteAccount(selectedAccount)}
                  disabled={deleteAccountMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
