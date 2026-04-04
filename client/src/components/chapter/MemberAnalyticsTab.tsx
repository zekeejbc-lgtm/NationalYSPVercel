import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/ui/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { KeyRound, Lock, PencilLine, Save, Search, ShieldAlert, Trophy, Unlock, Users } from "lucide-react";

type MemberRecord = {
  id: string;
  fullName: string;
  chapterId: string | null;
  barangayId: string | null;
  contactNumber: string;
  applicationStatus?: string | null;
  resolvedApplicationStatus?: string | null;
  isActive: boolean;
  registeredVoter: boolean;
  createdAt: string;
};

type BarangayOption = {
  id: string;
  barangayName: string;
  chapterId: string;
};

type BarangayAccount = {
  id: string;
  chapterId: string;
  barangayName: string;
  username: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
};

type BarangayLeaderboardEntry = {
  barangayId: string;
  barangayName: string;
  memberCount: number;
  rank: number;
};

type ChapterLeaderboardEntry = {
  chapterId: string;
  chapterName: string;
  score: number;
  completedKpis: number;
};

type OfficerEntry = {
  id: string;
  position: string;
  fullName: string;
  contactNumber: string;
  chapterEmail: string;
};

type BarangayAnalyticsRow = {
  id: string;
  barangayName: string;
  account: BarangayAccount | null;
  totalMembers: number;
  approvedMembers: number;
  pendingMembers: number;
  registeredVoters: number;
  rank: number | null;
  leaderboardMembers: number;
};

type MemberAnalyticsTabProps = {
  chapterId: string;
  chapterName?: string;
};

type PasswordPreview = {
  barangayName: string;
  temporaryPassword: string;
};

function normalizeBarangayName(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const analyticsChartConfig = {
  totalMembers: {
    label: "Total Members",
    color: "#2563eb",
  },
  pendingMembers: {
    label: "Pending Applications",
    color: "#f59e0b",
  },
  changed: {
    label: "Password Changed",
    color: "#16a34a",
  },
  notOpened: {
    label: "Not Opened Yet",
    color: "#f97316",
  },
  locked: {
    label: "Locked",
    color: "#dc2626",
  },
} satisfies ChartConfig;

function resolveApplicationStatus(member: MemberRecord): "approved" | "pending" | "rejected" {
  const resolved = (member.resolvedApplicationStatus || "").toLowerCase();
  if (resolved === "approved" || resolved === "pending" || resolved === "rejected") {
    return resolved;
  }

  const raw = (member.applicationStatus || "").toLowerCase();
  if (raw === "approved" || raw === "pending" || raw === "rejected") {
    return raw;
  }

  return member.isActive ? "approved" : "pending";
}

function isLocked(account: BarangayAccount | null) {
  if (!account?.lockedUntil) {
    return false;
  }

  return new Date(account.lockedUntil) > new Date();
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Never";
  }

  return parsed.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Never";
  }

  return parsed.toLocaleString();
}

function getPasswordAdoptionStatus(account: BarangayAccount | null) {
  if (!account) {
    return "No Account";
  }

  if (account.passwordChangedAt) {
    return "Password Changed";
  }

  if (account.mustChangePassword) {
    return "Not Opened Yet";
  }

  return "Pending Update";
}

function getAccountBadgeState(account: BarangayAccount | null) {
  if (!account) {
    return {
      label: "No Account",
      variant: "outline" as const,
    };
  }

  if (account.isActive) {
    return {
      label: "Active",
      variant: "default" as const,
    };
  }

  return {
    label: "Inactive",
    variant: "secondary" as const,
  };
}

export default function MemberAnalyticsTab({ chapterId, chapterName }: MemberAnalyticsTabProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  const [searchTerm, setSearchTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState<"all" | "needs-password" | "locked" | "inactive">("all");
  const [selectedBarangayId, setSelectedBarangayId] = useState<string>("");
  const [editingBarangayId, setEditingBarangayId] = useState<string | null>(null);
  const [editBarangayName, setEditBarangayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [passwordPreview, setPasswordPreview] = useState<PasswordPreview | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const analyticsQueryEnabled = !!chapterId;

  const {
    data: members = [],
    isLoading: membersLoading,
    isFetched: membersFetched,
  } = useQuery<MemberRecord[]>({
    queryKey: ["/api/members", { chapterId, scope: "analytics" }],
    queryFn: async () => {
      const response = await fetch(`/api/members?chapterId=${chapterId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load members");
      }
      return response.json();
    },
    enabled: analyticsQueryEnabled,
  });

  const {
    data: barangays = [],
    isLoading: barangaysLoading,
    isFetched: barangaysFetched,
  } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays"],
    queryFn: async () => {
      const response = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load barangays");
      }
      return response.json();
    },
    enabled: analyticsQueryEnabled,
  });

  const {
    data: barangayAccounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
    isError: accountsError,
    error: accountsErrorDetails,
  } = useQuery<BarangayAccount[]>({
    queryKey: ["/api/barangay-users", { chapterId, scope: "analytics" }],
    queryFn: async () => {
      const primaryResponse = await fetch(`/api/barangay-users?chapterId=${chapterId}`, { credentials: "include" });
      if (primaryResponse.ok) {
        return primaryResponse.json();
      }

      const fallbackResponse = await fetch(`/api/chapters/${chapterId}/barangay-users`, { credentials: "include" });
      if (fallbackResponse.ok) {
        return fallbackResponse.json();
      }

      const primaryErrorText = await primaryResponse.text().catch(() => "");
      const fallbackErrorText = await fallbackResponse.text().catch(() => "");
      const errorDetails = [
        `primary=${primaryResponse.status}`,
        primaryErrorText.trim() ? `(${primaryErrorText.trim()})` : "",
        `fallback=${fallbackResponse.status}`,
        fallbackErrorText.trim() ? `(${fallbackErrorText.trim()})` : "",
      ]
        .filter(Boolean)
        .join(" ");

      throw new Error(`Failed to load barangay accounts: ${errorDetails}`);
    },
    enabled: analyticsQueryEnabled,
  });

  const accountByNormalizedName = useMemo(() => {
    const map = new Map<string, BarangayAccount>();

    for (const account of barangayAccounts) {
      const key = normalizeBarangayName(account.barangayName);
      if (!key || map.has(key)) {
        continue;
      }

      map.set(key, account);
    }

    return map;
  }, [barangayAccounts]);

  const {
    data: barangayLeaderboard = [],
    isLoading: barangayLeaderboardLoading,
    isFetched: barangayLeaderboardFetched,
  } = useQuery<BarangayLeaderboardEntry[]>({
    queryKey: ["/api/barangay-leaderboard", { chapterId, scope: "analytics" }],
    queryFn: async () => {
      const response = await fetch(`/api/barangay-leaderboard?chapterId=${chapterId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load barangay leaderboard");
      }
      return response.json();
    },
    enabled: analyticsQueryEnabled,
  });

  const {
    data: chapterLeaderboard = [],
    isLoading: chapterLeaderboardLoading,
    isFetched: chapterLeaderboardFetched,
  } = useQuery<ChapterLeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", { year: currentYear, scope: "analytics" }],
    queryFn: async () => {
      const response = await fetch(`/api/leaderboard?timeframe=all&year=${currentYear}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load chapter leaderboard");
      }
      return response.json();
    },
    enabled: analyticsQueryEnabled,
  });

  const { data: selectedBarangayOfficers = [], isLoading: officersLoading } = useQuery<OfficerEntry[]>({
    queryKey: ["/api/chapter-officers", { chapterId, barangayId: selectedBarangayId, level: "barangay", scope: "analytics" }],
    queryFn: async () => {
      const response = await fetch(
        `/api/chapter-officers?chapterId=${chapterId}&level=barangay&barangayId=${selectedBarangayId}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Failed to load barangay officer directory");
      }
      return response.json();
    },
    enabled: !!chapterId && !!selectedBarangayId,
  });

  const updateBarangayMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<BarangayAccount> }) => {
      return apiRequest("PUT", `/api/barangay-users/${id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Barangay updated", description: "Barangay account details were saved." });
      setEditingBarangayId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chapters", chapterId, "barangays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-leaderboard"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ accountId }: { accountId: string }) => {
      return apiRequest("POST", `/api/reset-password/barangay/${accountId}`, {});
    },
    onSuccess: (data: any, variables) => {
      const targetBarangay = barangayAccounts.find((account) => account.id === variables.accountId);
      setPasswordPreview({
        barangayName: targetBarangay?.barangayName || "Barangay",
        temporaryPassword: data?.temporaryPassword || "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users"] });
      toast({ title: "Password reset", description: "Temporary password generated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async ({ accountId }: { accountId: string }) => {
      return apiRequest("POST", `/api/unlock-account/barangay/${accountId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Account unlocked", description: "Barangay account lock was cleared." });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const analyticsRows = useMemo<BarangayAnalyticsRow[]>(() => {
    const rowMap = new Map<string, BarangayAnalyticsRow>();

    for (const account of barangayAccounts) {
      rowMap.set(account.id, {
        id: account.id,
        barangayName: account.barangayName,
        account,
        totalMembers: 0,
        approvedMembers: 0,
        pendingMembers: 0,
        registeredVoters: 0,
        rank: null,
        leaderboardMembers: 0,
      });
    }

    for (const barangay of barangays) {
      if (!rowMap.has(barangay.id)) {
        const matchedAccount = accountByNormalizedName.get(normalizeBarangayName(barangay.barangayName)) || null;
        rowMap.set(barangay.id, {
          id: barangay.id,
          barangayName: barangay.barangayName,
          account: matchedAccount,
          totalMembers: 0,
          approvedMembers: 0,
          pendingMembers: 0,
          registeredVoters: 0,
          rank: null,
          leaderboardMembers: 0,
        });
      }
    }

    for (const member of members) {
      if (!member.barangayId) {
        continue;
      }

      if (!rowMap.has(member.barangayId)) {
        rowMap.set(member.barangayId, {
          id: member.barangayId,
          barangayName: "Unknown Barangay",
          account: null,
          totalMembers: 0,
          approvedMembers: 0,
          pendingMembers: 0,
          registeredVoters: 0,
          rank: null,
          leaderboardMembers: 0,
        });
      }

      const row = rowMap.get(member.barangayId);
      if (!row) {
        continue;
      }

      row.totalMembers += 1;
      if (member.registeredVoter) {
        row.registeredVoters += 1;
      }

      const status = resolveApplicationStatus(member);
      if (status === "approved") {
        row.approvedMembers += 1;
      } else if (status === "pending") {
        row.pendingMembers += 1;
      }
    }

    for (const leaderboardRow of barangayLeaderboard) {
      if (!rowMap.has(leaderboardRow.barangayId)) {
        const matchedAccount = accountByNormalizedName.get(normalizeBarangayName(leaderboardRow.barangayName)) || null;
        rowMap.set(leaderboardRow.barangayId, {
          id: leaderboardRow.barangayId,
          barangayName: leaderboardRow.barangayName,
          account: matchedAccount,
          totalMembers: leaderboardRow.memberCount,
          approvedMembers: leaderboardRow.memberCount,
          pendingMembers: 0,
          registeredVoters: 0,
          rank: leaderboardRow.rank,
          leaderboardMembers: leaderboardRow.memberCount,
        });
        continue;
      }

      const row = rowMap.get(leaderboardRow.barangayId);
      if (!row) {
        continue;
      }

      row.rank = leaderboardRow.rank;
      row.leaderboardMembers = leaderboardRow.memberCount;
      if (!row.barangayName || row.barangayName === "Unknown Barangay") {
        row.barangayName = leaderboardRow.barangayName;
      }
      if (!row.account) {
        row.account = accountByNormalizedName.get(normalizeBarangayName(row.barangayName)) || null;
      }
    }

    const rows = Array.from(rowMap.values()).map((row) => {
      if (!row.account) {
        row.account = accountByNormalizedName.get(normalizeBarangayName(row.barangayName)) || null;
      }

      return row;
    });

    const normalizedNameUsage = new Map<string, number>();
    for (const row of rows) {
      const key = normalizeBarangayName(row.barangayName);
      normalizedNameUsage.set(key, (normalizedNameUsage.get(key) || 0) + 1);
    }

    const dedupedRows = rows.filter((row) => {
      const key = normalizeBarangayName(row.barangayName);
      const hasDuplicateNames = (normalizedNameUsage.get(key) || 0) > 1;
      const isGhostAccountOnlyRow = row.rank === null && row.totalMembers === 0 && row.pendingMembers === 0 && row.approvedMembers === 0;

      if (!hasDuplicateNames) {
        return true;
      }

      return !isGhostAccountOnlyRow;
    });

    return dedupedRows.sort((a, b) => {
      const rankA = a.rank || Number.MAX_SAFE_INTEGER;
      const rankB = b.rank || Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return a.barangayName.localeCompare(b.barangayName);
    });
  }, [accountByNormalizedName, barangayAccounts, barangayLeaderboard, barangays, members]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return analyticsRows.filter((row) => {
      const matchesKeyword = !keyword
        || row.barangayName.toLowerCase().includes(keyword)
        || (row.account?.username || "").toLowerCase().includes(keyword);

      if (!matchesKeyword) {
        return false;
      }

      if (accountFilter === "needs-password") {
        return row.account !== null && !row.account.passwordChangedAt;
      }

      if (accountFilter === "locked") {
        return isLocked(row.account);
      }

      if (accountFilter === "inactive") {
        return row.account !== null && !row.account.isActive;
      }

      return true;
    });
  }, [accountFilter, analyticsRows, searchTerm]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedBarangayId) {
        setSelectedBarangayId("");
      }
      return;
    }

    const selectedStillExists = filteredRows.some((row) => row.id === selectedBarangayId);
    if (!selectedBarangayId || !selectedStillExists) {
      setSelectedBarangayId(filteredRows[0].id);
    }
  }, [filteredRows, selectedBarangayId]);

  const selectedBarangay = filteredRows.find((row) => row.id === selectedBarangayId) || null;

  const selectedBarangayMembers = useMemo(() => {
    if (!selectedBarangayId) {
      return [] as MemberRecord[];
    }

    return members
      .filter((member) => member.barangayId === selectedBarangayId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [members, selectedBarangayId]);

  const chapterRank = useMemo(() => {
    const index = chapterLeaderboard.findIndex((entry) => entry.chapterId === chapterId);
    if (index < 0) {
      return null;
    }

    return {
      rank: index + 1,
      score: chapterLeaderboard[index].score,
      completedKpis: chapterLeaderboard[index].completedKpis,
    };
  }, [chapterId, chapterLeaderboard]);

  const accountSummary = useMemo(() => {
    const withAccount = analyticsRows.filter((row) => row.account !== null);
    const changed = withAccount.filter((row) => Boolean(row.account?.passwordChangedAt)).length;
    const notOpened = withAccount.filter((row) => !row.account?.passwordChangedAt).length;
    const locked = withAccount.filter((row) => isLocked(row.account)).length;
    const inactive = withAccount.filter((row) => row.account && !row.account.isActive).length;

    return {
      totalBarangays: analyticsRows.length,
      totalAccounts: withAccount.length,
      changed,
      notOpened,
      locked,
      inactive,
    };
  }, [analyticsRows]);

  const memberDistributionRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        if (b.totalMembers !== a.totalMembers) {
          return b.totalMembers - a.totalMembers;
        }

        if (b.pendingMembers !== a.pendingMembers) {
          return b.pendingMembers - a.pendingMembers;
        }

        return a.barangayName.localeCompare(b.barangayName);
      })
      .slice(0, 15);
  }, [filteredRows]);

  const largestMemberCount = memberDistributionRows[0]?.totalMembers || 0;

  const passwordAdoptionData = useMemo(() => {
    return [
      { name: "Changed", value: accountSummary.changed, fill: "var(--color-changed)" },
      { name: "Not Opened", value: accountSummary.notOpened, fill: "var(--color-notOpened)" },
      { name: "Locked", value: accountSummary.locked, fill: "var(--color-locked)" },
    ].filter((entry) => entry.value > 0);
  }, [accountSummary.changed, accountSummary.locked, accountSummary.notOpened]);

  const isDashboardAnalyticsLoading =
    analyticsQueryEnabled &&
    !accountsError &&
    (
      membersLoading ||
      !membersFetched ||
      accountsLoading ||
      !accountsFetched ||
      barangaysLoading ||
      !barangaysFetched ||
      barangayLeaderboardLoading ||
      !barangayLeaderboardFetched ||
      chapterLeaderboardLoading ||
      !chapterLeaderboardFetched
    );

  const beginEdit = (row: BarangayAnalyticsRow) => {
    if (!row.account) {
      return;
    }

    setEditingBarangayId(row.id);
    setEditBarangayName(row.account.barangayName);
    setEditUsername(row.account.username);
    setEditActive(row.account.isActive);
  };

  const saveBarangayEdit = () => {
    if (!selectedBarangay?.account) {
      return;
    }

    const barangayName = editBarangayName.trim();
    const username = editUsername.trim();

    if (!barangayName || !username) {
      toast({
        title: "Missing fields",
        description: "Barangay name and username are required.",
        variant: "destructive",
      });
      return;
    }

    updateBarangayMutation.mutate({
      id: selectedBarangay.account.id,
      payload: {
        barangayName,
        username,
        isActive: editActive,
      },
    });
  };

  return (
    <div className="space-y-6" data-testid="tab-content-member-analytics">
      {passwordPreview && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Temporary Password Generated
            </CardTitle>
            <CardDescription>
              Save this now for {passwordPreview.barangayName}. This password is shown once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono text-lg tracking-wide">{passwordPreview.temporaryPassword || "-"}</div>
            <Button variant="outline" onClick={() => setPasswordPreview(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-primary">{accountSummary.totalBarangays}</div>
          <div className="text-sm text-muted-foreground">Barangays in {chapterName || "Chapter"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{accountSummary.notOpened}</div>
          <div className="text-sm text-muted-foreground">Accounts Not Opened Yet</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-destructive">{accountSummary.locked}</div>
          <div className="text-sm text-muted-foreground">Locked Barangay Accounts</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{chapterRank ? `#${chapterRank.rank}` : "-"}</div>
          <div className="text-sm text-muted-foreground">Chapter KPI Leaderboard Rank</div>
          <div className="text-xs text-muted-foreground mt-1">
            {chapterRank ? `${chapterRank.completedKpis} completed KPI(s), ${chapterRank.score} pts` : "No ranking yet"}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Barangay Member Snapshot</CardTitle>
            <CardDescription>
              Scalable ranked list for chapters with many barangays.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {memberDistributionRows.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
                No member distribution data yet.
              </div>
            ) : (
              <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {memberDistributionRows.map((row) => {
                  const progressPercent = largestMemberCount > 0
                    ? Math.max(6, Math.round((row.totalMembers / largestMemberCount) * 100))
                    : 0;

                  return (
                    <div key={row.id} className="rounded-md border bg-muted/20 p-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{row.barangayName}</p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {row.totalMembers} member(s)
                        </span>
                      </div>

                      <div className="mt-2 h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Pending: {row.pendingMembers}</span>
                        <span>Approved: {row.approvedMembers}</span>
                      </div>
                    </div>
                  );
                })}

                <p className="pt-1 text-xs text-muted-foreground">
                  Showing top {memberDistributionRows.length} barangay rows by member count.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account Adoption Status</CardTitle>
            <CardDescription>Password change and lock status of barangay login accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            {passwordAdoptionData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
                No account status data yet.
              </div>
            ) : (
              <ChartContainer config={analyticsChartConfig} className="h-[280px] w-full aspect-auto">
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" />} />
                  <Pie data={passwordAdoptionData} dataKey="value" nameKey="name" innerRadius="40%" outerRadius="80%" paddingAngle={3}>
                    {passwordAdoptionData.map((entry, index) => (
                      <Cell key={`password-adoption-${entry.name}-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <p>Password Changed: {accountSummary.changed}</p>
              <p>Not Opened Yet: {accountSummary.notOpened}</p>
              <p>Locked: {accountSummary.locked}</p>
              <p>Inactive: {accountSummary.inactive}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Barangay Analytics Directory</CardTitle>
          <CardDescription>
            Inspect each barangay account, member footprint, account adoption, and leaderboard placement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountsError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" data-testid="alert-member-analytics-accounts-error">
              Barangay account records failed to load. {accountsErrorDetails instanceof Error ? accountsErrorDetails.message : "Please refresh or re-login."}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
                placeholder="Search barangay or username..."
                data-testid="input-member-analytics-search"
              />
            </div>
            <div className="sm:w-56">
              <Select value={accountFilter} onValueChange={(value) => setAccountFilter(value as typeof accountFilter)}>
                <SelectTrigger data-testid="select-member-analytics-filter">
                  <SelectValue placeholder="Filter account status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  <SelectItem value="needs-password">Needs Password Change</SelectItem>
                  <SelectItem value="locked">Locked Accounts</SelectItem>
                  <SelectItem value="inactive">Inactive Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isDashboardAnalyticsLoading ? (
            <LoadingState label="Loading barangay analytics..." rows={3} compact />
          ) : filteredRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No barangays match your current filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((row) => {
                const selected = row.id === selectedBarangayId;
                const locked = isLocked(row.account);
                const accountBadge = getAccountBadgeState(row.account);

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedBarangayId(row.id);
                      setInspectorOpen(true);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
                    data-testid={`member-analytics-row-${row.id}`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold break-words">{row.barangayName}</span>
                          <Badge variant="outline">Rank: {row.rank ? `#${row.rank}` : "-"}</Badge>
                          <Badge variant={accountBadge.variant}>{accountBadge.label}</Badge>
                          {locked && (
                            <Badge variant="destructive" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Locked
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          <span>Username: {row.account?.username || "No account"}</span>
                          <span>Members: {row.totalMembers}</span>
                          <span>Pending: {row.pendingMembers}</span>
                          <span>Registered Voters: {row.registeredVoters}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Password Status: {getPasswordAdoptionStatus(row.account)}
                          {row.account ? ` (last changed: ${formatDate(row.account.passwordChangedAt)})` : ""}
                        </div>
                      </div>

                      {row.account && (
                        <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => beginEdit(row)}
                            data-testid={`button-member-analytics-edit-${row.id}`}
                          >
                            <PencilLine className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => resetPasswordMutation.mutate({ accountId: row.account!.id })}
                            disabled={resetPasswordMutation.isPending}
                            data-testid={`button-member-analytics-reset-password-${row.id}`}
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            Reset Password
                          </Button>
                          {locked && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => unlockMutation.mutate({ accountId: row.account!.id })}
                              disabled={unlockMutation.isPending}
                              data-testid={`button-member-analytics-unlock-${row.id}`}
                            >
                              <Unlock className="h-4 w-4 mr-1" />
                              Unlock
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={inspectorOpen}
        onOpenChange={(open) => {
          setInspectorOpen(open);
          if (!open) {
            setEditingBarangayId(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Barangay Inspector</DialogTitle>
            <DialogDescription>
              Center panel for full barangay inspection: account controls, directory, and member details.
            </DialogDescription>
          </DialogHeader>

          {!selectedBarangay ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Select a barangay to inspect details.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Selected Barangay Inspector</CardTitle>
                  <CardDescription>
                    Inspect full barangay directory details and update account information when needed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{selectedBarangay.barangayName}</h4>
                      <Badge variant="outline">Leaderboard: {selectedBarangay.rank ? `#${selectedBarangay.rank}` : "-"}</Badge>
                      {selectedBarangay.account?.mustChangePassword && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          Must Change Password
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Username: {selectedBarangay.account?.username || "No account"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Account Created: {formatDateTime(selectedBarangay.account?.createdAt)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Password Changed: {formatDateTime(selectedBarangay.account?.passwordChangedAt)}
                    </p>
                  </div>

                  {editingBarangayId === selectedBarangay.id && selectedBarangay.account ? (
                    <div className="rounded-md border p-3 space-y-3">
                      <h5 className="text-sm font-semibold">Edit Barangay Account</h5>
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">Barangay Name</label>
                        <Input
                          value={editBarangayName}
                          onChange={(event) => setEditBarangayName(event.target.value)}
                          data-testid="input-member-analytics-edit-barangay-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">Username</label>
                        <Input
                          value={editUsername}
                          onChange={(event) => setEditUsername(event.target.value)}
                          data-testid="input-member-analytics-edit-username"
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border p-2">
                        <span className="text-sm">Active Account</span>
                        <Switch checked={editActive} onCheckedChange={setEditActive} data-testid="switch-member-analytics-edit-active" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={saveBarangayEdit} disabled={updateBarangayMutation.isPending} data-testid="button-member-analytics-save-edit">
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </Button>
                        <Button variant="outline" onClick={() => setEditingBarangayId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    selectedBarangay.account && (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        <p>
                          This barangay account can be edited by the city chapter for quick corrections and access management.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => beginEdit(selectedBarangay)}
                          data-testid="button-member-analytics-open-edit"
                        >
                          <PencilLine className="h-4 w-4 mr-1" />
                          Edit Barangay Account
                        </Button>
                      </div>
                    )
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Total Members</p>
                      <p className="text-xl font-semibold">{selectedBarangay.totalMembers}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Approved Directory</p>
                      <p className="text-xl font-semibold">{selectedBarangay.approvedMembers}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Pending Applications</p>
                      <p className="text-xl font-semibold">{selectedBarangay.pendingMembers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    Directory Drill-Down
                  </CardTitle>
                  <CardDescription>
                    Officer and member directory for the selected barangay.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-semibold">Officer Directory</p>
                    {officersLoading ? (
                      <LoadingState label="Loading officer directory..." rows={1} compact />
                    ) : selectedBarangayOfficers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No barangay officers recorded yet.</p>
                    ) : (
                      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                        {selectedBarangayOfficers.map((officer) => (
                          <div key={officer.id} className="rounded-md border bg-muted/20 p-2">
                            <p className="text-sm font-medium break-words">{officer.fullName}</p>
                            <p className="text-xs text-muted-foreground">{officer.position}</p>
                            <p className="text-xs text-muted-foreground">{officer.contactNumber || "No contact"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Member Directory
                    </p>
                    {selectedBarangayMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No members in this barangay yet.</p>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {selectedBarangayMembers.map((member) => {
                          const status = resolveApplicationStatus(member);

                          return (
                            <div key={member.id} className="rounded-md border bg-muted/20 p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium break-words">{member.fullName}</p>
                                <Badge
                                  variant={status === "approved" ? "default" : status === "pending" ? "secondary" : "destructive"}
                                  className="text-[10px]"
                                >
                                  {status.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">Contact: {member.contactNumber || "-"}</p>
                              <p className="text-xs text-muted-foreground">Added: {formatDate(member.createdAt)}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
