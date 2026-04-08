import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingState from "@/components/ui/loading-state";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { BarangayUser, Chapter, ChapterRequest, Member, NationalRequest, Program, VolunteerOpportunity } from "@shared/schema";

type PublicationAnalyticsResponse = {
  summary?: {
    total?: number;
    approved?: number;
    pending?: number;
    rejected?: number;
  };
};

type MemberWithLifecycle = Member & {
  resolvedApplicationStatus?: string | null;
  memberLifecycleState?: string | null;
  isCurrentMember?: boolean;
  isApplying?: boolean;
};

const statsChartConfig = {
  pending: { label: "Pending", color: "#f59e0b" },
  approved: { label: "Approved", color: "#22c55e" },
  rejected: { label: "Rejected", color: "#ef4444" },
  directory: { label: "Directory", color: "#3b82f6" },
  applying: { label: "Applying", color: "#f97316" },
  programs: { label: "Programs", color: "#6366f1" },
  chapters: { label: "Chapters", color: "#14b8a6" },
  barangays: { label: "Barangays", color: "#f59e0b" },
  volunteer: { label: "Volunteer", color: "#22c55e" },
  inbox: { label: "Inbox", color: "#3b82f6" },
  funding: { label: "Funding", color: "#f97316" },
} satisfies ChartConfig;

const PUBLICATION_STATUS_COLORS = ["#f59e0b", "#22c55e", "#ef4444"];
const MEMBERSHIP_STATUS_COLORS = ["#3b82f6", "#f97316"];
const OPERATIONS_STRUCTURE_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#22c55e"];
const OPERATIONS_QUEUE_COLORS = ["#3b82f6", "#f97316"];

export default function StatsManager() {
  const {
    data: publicationsAnalytics,
    isFetched: publicationsAnalyticsFetched,
    isError: publicationsAnalyticsErrored,
  } = useQuery<PublicationAnalyticsResponse>({
    queryKey: ["/api/publications/analytics"],
  });

  const {
    data: programs = [],
    isFetched: programsFetched,
    isError: programsErrored,
  } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const {
    data: chapters = [],
    isFetched: chaptersFetched,
    isError: chaptersErrored,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const {
    data: barangayUsers = [],
    isFetched: barangayUsersFetched,
    isError: barangayUsersErrored,
  } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users"],
  });

  const {
    data: members = [],
    isFetched: membersFetched,
    isError: membersErrored,
  } = useQuery<MemberWithLifecycle[]>({
    queryKey: ["/api/members"],
  });

  const {
    data: nationalRequests = [],
    isFetched: nationalRequestsFetched,
    isError: nationalRequestsErrored,
  } = useQuery<NationalRequest[]>({
    queryKey: ["/api/national-requests"],
  });

  const {
    data: chapterRequests = [],
    isFetched: chapterRequestsFetched,
    isError: chapterRequestsErrored,
  } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests"],
  });

  const {
    data: volunteerOpportunities = [],
    isFetched: volunteerOpportunitiesFetched,
    isError: volunteerOpportunitiesErrored,
  } = useQuery<VolunteerOpportunity[]>({
    queryKey: ["/api/volunteer-opportunities"],
  });

  const resolveMemberStatus = (member: MemberWithLifecycle): "approved" | "pending" | "rejected" => {
    const normalizedLifecycle = (member.memberLifecycleState || "").toLowerCase();
    if (normalizedLifecycle === "member") {
      return "approved";
    }

    if (normalizedLifecycle === "applying") {
      return "pending";
    }

    if (normalizedLifecycle === "rejected") {
      return "rejected";
    }

    const normalizedStatus = (member.resolvedApplicationStatus || member.applicationStatus || "").toLowerCase();
    if (normalizedStatus === "approved" || normalizedStatus === "pending" || normalizedStatus === "rejected") {
      return normalizedStatus;
    }

    return member.isActive ? "approved" : "pending";
  };

  const liveStatistics = useMemo(() => {
    const publicationSummary = publicationsAnalytics?.summary || {};
    const publicationTotal = publicationSummary.total || 0;
    const publicationApproved = publicationSummary.approved || 0;
    const publicationPending = publicationSummary.pending || 0;
    const publicationRejected = publicationSummary.rejected || 0;

    const memberDirectoryCount = members.filter((member) => {
      if (typeof member.isCurrentMember === "boolean") {
        return member.isCurrentMember;
      }

      return resolveMemberStatus(member) === "approved";
    }).length;

    const memberApplyingCount = members.filter((member) => {
      if (typeof member.isApplying === "boolean") {
        return member.isApplying;
      }

      return resolveMemberStatus(member) === "pending";
    }).length;

    const newInboxCount = nationalRequests.filter(
      (request) => (request.status || "").toUpperCase() === "NEW",
    ).length;

    const newFundingRequestCount = chapterRequests.filter(
      (request) =>
        (request.type || "").toLowerCase() === "funding_request" &&
        (request.status || "").toLowerCase() === "new",
    ).length;

    return {
      publicationTotal,
      publicationPending,
      publicationApproved,
      publicationRejected,
      programsCount: programs.length,
      chaptersCount: chapters.length,
      barangayChapterCount: barangayUsers.length,
      memberDirectoryCount,
      memberApplyingCount,
      newInboxCount,
      newFundingRequestCount,
      volunteerOpportunitiesCount: volunteerOpportunities.length,
    };
  }, [barangayUsers, chapterRequests, chapters, members, nationalRequests, programs, publicationsAnalytics, volunteerOpportunities]);

  const isLiveStatsPending =
    !publicationsAnalyticsFetched ||
    !programsFetched ||
    !chaptersFetched ||
    !barangayUsersFetched ||
    !membersFetched ||
    !nationalRequestsFetched ||
    !chapterRequestsFetched ||
    !volunteerOpportunitiesFetched;

  const hasLiveStatsError =
    publicationsAnalyticsErrored ||
    programsErrored ||
    chaptersErrored ||
    barangayUsersErrored ||
    membersErrored ||
    nationalRequestsErrored ||
    chapterRequestsErrored ||
    volunteerOpportunitiesErrored;

  const publicationSummaryStats = [
    { label: "Publications (Total)", value: liveStatistics.publicationTotal },
    { label: "Publications Pending", value: liveStatistics.publicationPending },
    { label: "Publications Approved", value: liveStatistics.publicationApproved },
    { label: "Publications Rejected", value: liveStatistics.publicationRejected },
  ];

  const membershipSummaryStats = [
    { label: "Members in Directory", value: liveStatistics.memberDirectoryCount },
    { label: "Members Applying", value: liveStatistics.memberApplyingCount },
  ];

  const operationsSummaryStats = [
    { label: "Programs", value: liveStatistics.programsCount },
    { label: "Chapters", value: liveStatistics.chaptersCount },
    { label: "Barangay Chapters", value: liveStatistics.barangayChapterCount },
    { label: "New Inbox Messages", value: liveStatistics.newInboxCount },
    { label: "New Funding Requests", value: liveStatistics.newFundingRequestCount },
    { label: "Volunteer Opportunities", value: liveStatistics.volunteerOpportunitiesCount },
  ];

  const publicationStatusChartData = [
    { key: "pending", label: "Pending", value: liveStatistics.publicationPending },
    { key: "approved", label: "Approved", value: liveStatistics.publicationApproved },
    { key: "rejected", label: "Rejected", value: liveStatistics.publicationRejected },
  ];

  const membershipStatusChartData = [
    { key: "directory", label: "Directory", value: liveStatistics.memberDirectoryCount },
    { key: "applying", label: "Applying", value: liveStatistics.memberApplyingCount },
  ];

  const operationsStructureChartData = [
    { key: "programs", label: "Programs", value: liveStatistics.programsCount },
    { key: "chapters", label: "Chapters", value: liveStatistics.chaptersCount },
    { key: "barangays", label: "Barangays", value: liveStatistics.barangayChapterCount },
    { key: "volunteer", label: "Volunteer", value: liveStatistics.volunteerOpportunitiesCount },
  ];

  const operationsQueueChartData = [
    { key: "inbox", label: "New Inbox", value: liveStatistics.newInboxCount },
    { key: "funding", label: "New Funding", value: liveStatistics.newFundingRequestCount },
  ];

  const hasPublicationStatusData = publicationStatusChartData.some((item) => item.value > 0);
  const hasMembershipStatusData = membershipStatusChartData.some((item) => item.value > 0);
  const hasOperationsStructureData = operationsStructureChartData.some((item) => item.value > 0);
  const hasOperationsQueueData = operationsQueueChartData.some((item) => item.value > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Actual Statistics</CardTitle>
          <CardDescription>
            Live totals from publications, members, inbox, funding requests, and volunteer data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLiveStatsPending ? (
            <LoadingState label="Loading actual statistics..." rows={2} />
          ) : (
            <div className="space-y-4">
              {hasLiveStatsError && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  Some metrics could not be loaded and may show as 0.
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="min-w-0 space-y-4 rounded-lg border bg-muted/10 p-4">
                  <div>
                    <h3 className="text-base font-semibold">Publications Summary</h3>
                    <p className="text-xs text-muted-foreground">Publication moderation breakdown</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {publicationSummaryStats.map((item) => (
                      <div key={item.label} className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-xl font-semibold" data-testid={`text-actual-stat-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                          {item.value.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  {hasPublicationStatusData ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                      <ChartContainer config={statsChartConfig} className="h-[220px] w-full min-w-0 aspect-auto">
                        <PieChart>
                          <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" />} />
                          <Pie data={publicationStatusChartData} dataKey="value" nameKey="label" innerRadius="40%" outerRadius="78%" paddingAngle={2}>
                            {publicationStatusChartData.map((item, index) => (
                              <Cell key={`publication-status-${item.key}`} fill={PUBLICATION_STATUS_COLORS[index % PUBLICATION_STATUS_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>

                      <div className="space-y-2">
                        {publicationStatusChartData.map((item, index) => (
                          <div key={item.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PUBLICATION_STATUS_COLORS[index % PUBLICATION_STATUS_COLORS.length] }} />
                              {item.label}
                            </span>
                            <span className="font-medium">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      No publication status data yet.
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-4 rounded-lg border bg-muted/10 p-4">
                  <div>
                    <h3 className="text-base font-semibold">Membership Summary</h3>
                    <p className="text-xs text-muted-foreground">Directory and applications overview</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {membershipSummaryStats.map((item) => (
                      <div key={item.label} className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-xl font-semibold" data-testid={`text-actual-stat-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                          {item.value.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  {hasMembershipStatusData ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                      <ChartContainer config={statsChartConfig} className="h-[220px] w-full min-w-0 aspect-auto">
                        <PieChart>
                          <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" />} />
                          <Pie data={membershipStatusChartData} dataKey="value" nameKey="label" innerRadius="40%" outerRadius="78%" paddingAngle={2}>
                            {membershipStatusChartData.map((item, index) => (
                              <Cell key={`member-status-${item.key}`} fill={MEMBERSHIP_STATUS_COLORS[index % MEMBERSHIP_STATUS_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>

                      <div className="space-y-2">
                        {membershipStatusChartData.map((item, index) => (
                          <div key={item.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MEMBERSHIP_STATUS_COLORS[index % MEMBERSHIP_STATUS_COLORS.length] }} />
                              {item.label}
                            </span>
                            <span className="font-medium">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      No member lifecycle data yet.
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-4 rounded-lg border bg-muted/10 p-4">
                  <div>
                    <h3 className="text-base font-semibold">Operations Summary</h3>
                    <p className="text-xs text-muted-foreground">Network and request activity sections</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {operationsSummaryStats.map((item) => (
                      <div key={item.label} className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-xl font-semibold" data-testid={`text-actual-stat-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                          {item.value.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {hasOperationsStructureData ? (
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="text-xs font-medium text-muted-foreground">Network Distribution</p>
                        <ChartContainer config={statsChartConfig} className="h-[180px] w-full min-w-0 aspect-auto">
                          <PieChart>
                            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" />} />
                            <Pie data={operationsStructureChartData} dataKey="value" nameKey="label" innerRadius="40%" outerRadius="78%" paddingAngle={2}>
                              {operationsStructureChartData.map((item, index) => (
                                <Cell key={`operations-structure-${item.key}`} fill={OPERATIONS_STRUCTURE_COLORS[index % OPERATIONS_STRUCTURE_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                      </div>
                    ) : (
                      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                        No network distribution data yet.
                      </div>
                    )}

                    {hasOperationsQueueData ? (
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <p className="text-xs font-medium text-muted-foreground">Queue Distribution</p>
                        <ChartContainer config={statsChartConfig} className="h-[180px] w-full min-w-0 aspect-auto">
                          <PieChart>
                            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="label" />} />
                            <Pie data={operationsQueueChartData} dataKey="value" nameKey="label" innerRadius="40%" outerRadius="78%" paddingAngle={2}>
                              {operationsQueueChartData.map((item, index) => (
                                <Cell key={`operations-queue-${item.key}`} fill={OPERATIONS_QUEUE_COLORS[index % OPERATIONS_QUEUE_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                      </div>
                    ) : (
                      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                        No queue distribution data yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
