import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart3, CalendarClock, Check, ChevronsUpDown, Crown, HandCoins, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import type { Chapter, ChapterRequest } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ChapterFundingAggregate = {
  chapterId: string;
  chapterName: string;
  totalRequests: number;
  requestedTotal: number;
  approvedTotal: number;
  approvedCount: number;
  rejectedCount: number;
  inReviewCount: number;
  newCount: number;
};

type ChapterRequestsAnalyticsPanelProps = {
  requests: ChapterRequest[];
  chapters: Chapter[];
};

type RejectedAmountBucket = {
  key: string;
  label: string;
  min: number;
  max?: number;
};

const CHAPTER_FILTER_ALL = "all";
const UNKNOWN_CHAPTER_NAME = "Unknown Chapter";
const PIE_COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#ef4444"];

const REJECTED_AMOUNT_BUCKETS: RejectedAmountBucket[] = [
  { key: "below-5000", label: "< 5,000", min: 0, max: 5000 },
  { key: "5000-9999", label: "5,000-9,999", min: 5000, max: 10000 },
  { key: "10000-19999", label: "10,000-19,999", min: 10000, max: 20000 },
  { key: "20000-49999", label: "20,000-49,999", min: 20000, max: 50000 },
  { key: "50000-plus", label: "50,000+", min: 50000 },
];

const analyticsChartConfig = {
  requested: { label: "Requested", color: "#2563eb" },
  approved: { label: "Given", color: "#16a34a" },
  total: { label: "Total", color: "#f97316" },
  count: { label: "Count", color: "#dc2626" },
  NEW: { label: "New", color: "#3b82f6" },
  IN_REVIEW: { label: "In Review", color: "#f59e0b" },
  APPROVED: { label: "Approved", color: "#22c55e" },
  REJECTED: { label: "Rejected", color: "#ef4444" },
} satisfies ChartConfig;

function formatCurrency(value: number | null | undefined) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function toValidDate(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return dateValue;
}

function getRejectedBucket(amount: number) {
  return (
    REJECTED_AMOUNT_BUCKETS.find((bucket) => {
      const meetsMin = amount >= bucket.min;
      const meetsMax = bucket.max === undefined || amount < bucket.max;
      return meetsMin && meetsMax;
    }) || REJECTED_AMOUNT_BUCKETS[REJECTED_AMOUNT_BUCKETS.length - 1]
  );
}

export default function ChapterRequestsAnalyticsPanel({ requests, chapters }: ChapterRequestsAnalyticsPanelProps) {
  const [selectedChapterId, setSelectedChapterId] = useState(CHAPTER_FILTER_ALL);
  const [chapterFilterOpen, setChapterFilterOpen] = useState(false);

  const chapterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chapter of chapters) {
      map.set(chapter.id, chapter.name);
    }
    return map;
  }, [chapters]);

  const sortedChapters = useMemo(
    () => [...chapters].sort((left, right) => left.name.localeCompare(right.name)),
    [chapters],
  );

  const selectedChapterLabel =
    selectedChapterId === CHAPTER_FILTER_ALL
      ? "All Chapters"
      : chapterNameById.get(selectedChapterId) || UNKNOWN_CHAPTER_NAME;

  const fundingRequests = useMemo(
    () => requests.filter((request) => request.type === "funding_request"),
    [requests],
  );

  const chapterFundingAggregates = useMemo(() => {
    const aggregateMap = new Map<string, ChapterFundingAggregate>();

    for (const chapter of chapters) {
      aggregateMap.set(chapter.id, {
        chapterId: chapter.id,
        chapterName: chapter.name,
        totalRequests: 0,
        requestedTotal: 0,
        approvedTotal: 0,
        approvedCount: 0,
        rejectedCount: 0,
        inReviewCount: 0,
        newCount: 0,
      });
    }

    for (const request of fundingRequests) {
      if (!aggregateMap.has(request.chapterId)) {
        aggregateMap.set(request.chapterId, {
          chapterId: request.chapterId,
          chapterName: chapterNameById.get(request.chapterId) || UNKNOWN_CHAPTER_NAME,
          totalRequests: 0,
          requestedTotal: 0,
          approvedTotal: 0,
          approvedCount: 0,
          rejectedCount: 0,
          inReviewCount: 0,
          newCount: 0,
        });
      }

      const aggregate = aggregateMap.get(request.chapterId)!;
      const requestedAmount = Math.max(0, request.requestedAmount || 0);
      const approvedAmount = Math.max(0, request.approvedAmount || 0);

      aggregate.totalRequests += 1;
      aggregate.requestedTotal += requestedAmount;

      if (request.status === "approved") {
        aggregate.approvedCount += 1;
        aggregate.approvedTotal += approvedAmount;
      } else if (request.status === "rejected") {
        aggregate.rejectedCount += 1;
      } else if (request.status === "in_review") {
        aggregate.inReviewCount += 1;
      } else {
        aggregate.newCount += 1;
      }
    }

    const values = Array.from(aggregateMap.values()).sort((left, right) => {
      if (right.requestedTotal !== left.requestedTotal) {
        return right.requestedTotal - left.requestedTotal;
      }
      if (right.approvedTotal !== left.approvedTotal) {
        return right.approvedTotal - left.approvedTotal;
      }
      return right.totalRequests - left.totalRequests;
    });

    const byId = new Map(values.map((entry) => [entry.chapterId, entry]));

    return { values, byId };
  }, [fundingRequests, chapters, chapterNameById]);

  const totals = useMemo(() => {
    let totalRequested = 0;
    let totalGiven = 0;
    let outstandingRequested = 0;
    let outstandingGiven = 0;

    for (const request of fundingRequests) {
      const requestedAmount = Math.max(0, request.requestedAmount || 0);
      const approvedAmount = Math.max(0, request.approvedAmount || 0);

      totalRequested += requestedAmount;
      if (request.status === "approved") {
        totalGiven += approvedAmount;
        outstandingGiven += approvedAmount;
      }

      if (request.status === "new" || request.status === "in_review") {
        outstandingRequested += requestedAmount;
      }
    }

    return {
      totalRequested,
      totalGiven,
      outstandingRequested,
      outstandingGiven,
    };
  }, [fundingRequests]);

  const largestRequestedFund = useMemo(() => {
    return (
      fundingRequests
        .map((request) => ({
          request,
          amount: Math.max(0, request.requestedAmount || 0),
        }))
        .filter((entry) => entry.amount > 0)
        .sort((left, right) => right.amount - left.amount)[0] || null
    );
  }, [fundingRequests]);

  const largestGivenFund = useMemo(() => {
    return (
      fundingRequests
        .map((request) => ({
          request,
          amount: Math.max(0, request.approvedAmount || 0),
        }))
        .filter((entry) => entry.request.status === "approved" && entry.amount > 0)
        .sort((left, right) => right.amount - left.amount)[0] || null
    );
  }, [fundingRequests]);

  const selectedChapterSummary =
    selectedChapterId === CHAPTER_FILTER_ALL
      ? null
      : chapterFundingAggregates.byId.get(selectedChapterId) || {
          chapterId: selectedChapterId,
          chapterName: chapterNameById.get(selectedChapterId) || UNKNOWN_CHAPTER_NAME,
          totalRequests: 0,
          requestedTotal: 0,
          approvedTotal: 0,
          approvedCount: 0,
          rejectedCount: 0,
          inReviewCount: 0,
          newCount: 0,
        };

  const topRequester = useMemo(
    () =>
      chapterFundingAggregates.values
        .filter((entry) => entry.requestedTotal > 0)
        .sort((left, right) => right.requestedTotal - left.requestedTotal)[0] || null,
    [chapterFundingAggregates.values],
  );

  const topBudgetGiven = useMemo(
    () =>
      chapterFundingAggregates.values
        .filter((entry) => entry.approvedTotal > 0)
        .sort((left, right) => right.approvedTotal - left.approvedTotal)[0] || null,
    [chapterFundingAggregates.values],
  );

  const topApproved = useMemo(
    () =>
      chapterFundingAggregates.values
        .filter((entry) => entry.approvedCount > 0)
        .sort((left, right) => right.approvedCount - left.approvedCount)[0] || null,
    [chapterFundingAggregates.values],
  );

  const topRejected = useMemo(
    () =>
      chapterFundingAggregates.values
        .filter((entry) => entry.rejectedCount > 0)
        .sort((left, right) => right.rejectedCount - left.rejectedCount)[0] || null,
    [chapterFundingAggregates.values],
  );

  const statusChartData = useMemo(() => {
    const counters = {
      NEW: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
    };

    for (const request of fundingRequests) {
      if (request.status === "approved") {
        counters.APPROVED += 1;
      } else if (request.status === "rejected") {
        counters.REJECTED += 1;
      } else if (request.status === "in_review") {
        counters.IN_REVIEW += 1;
      } else {
        counters.NEW += 1;
      }
    }

    return [
      { status: "New", key: "NEW", count: counters.NEW },
      { status: "In Review", key: "IN_REVIEW", count: counters.IN_REVIEW },
      { status: "Approved", key: "APPROVED", count: counters.APPROVED },
      { status: "Rejected", key: "REJECTED", count: counters.REJECTED },
    ];
  }, [fundingRequests]);

  const chapterRequestedVsGivenChartData = useMemo(() => {
    return chapterFundingAggregates.values
      .filter((entry) => entry.totalRequests > 0)
      .slice(0, 8)
      .map((entry) => ({
        chapterName: entry.chapterName,
        requested: entry.requestedTotal,
        approved: entry.approvedTotal,
      }));
  }, [chapterFundingAggregates.values]);

  const maxTopRequested = useMemo(
    () => chapterRequestedVsGivenChartData.reduce((maxValue, row) => Math.max(maxValue, row.requested), 0),
    [chapterRequestedVsGivenChartData],
  );

  const maxTopApproved = useMemo(
    () => chapterRequestedVsGivenChartData.reduce((maxValue, row) => Math.max(maxValue, row.approved), 0),
    [chapterRequestedVsGivenChartData],
  );

  const rejectedAmountBuckets = useMemo(() => {
    const bucketMap = new Map(
      REJECTED_AMOUNT_BUCKETS.map((bucket) => [bucket.key, { ...bucket, count: 0, total: 0 }]),
    );

    for (const request of fundingRequests) {
      if (request.status !== "rejected") {
        continue;
      }

      const requestedAmount = Math.max(0, request.requestedAmount || 0);
      if (requestedAmount <= 0) {
        continue;
      }

      const bucket = getRejectedBucket(requestedAmount);
      const target = bucketMap.get(bucket.key);
      if (!target) {
        continue;
      }

      target.count += 1;
      target.total += requestedAmount;
    }

    return REJECTED_AMOUNT_BUCKETS.map((bucket) => {
      const result = bucketMap.get(bucket.key);
      return {
        label: bucket.label,
        count: result?.count || 0,
        total: result?.total || 0,
      };
    });
  }, [fundingRequests]);

  const mostRejectedBucket = useMemo(() => {
    return (
      [...rejectedAmountBuckets]
        .filter((bucket) => bucket.count > 0)
        .sort((left, right) => right.count - left.count)[0] || null
    );
  }, [rejectedAmountBuckets]);

  const approvedGrantHistory = useMemo(() => {
    return fundingRequests
      .filter((request) => request.status === "approved" && (request.approvedAmount || 0) > 0)
      .map((request) => {
        const approvedDate = toValidDate(request.approvedAt) || toValidDate(request.createdAt);
        return {
          id: request.id,
          chapterName: chapterNameById.get(request.chapterId) || UNKNOWN_CHAPTER_NAME,
          chapterId: request.chapterId,
          activity: request.proposedActivityName || "Unnamed Request",
          requestedAmount: Math.max(0, request.requestedAmount || 0),
          approvedAmount: Math.max(0, request.approvedAmount || 0),
          approvedDate,
          adminReply: request.adminReply || "",
        };
      })
      .sort((left, right) => {
        const leftTime = left.approvedDate ? left.approvedDate.getTime() : 0;
        const rightTime = right.approvedDate ? right.approvedDate.getTime() : 0;
        return rightTime - leftTime;
      });
  }, [fundingRequests, chapterNameById]);

  const givenHistoryTrend = useMemo(() => {
    const monthlyMap = new Map<string, { monthKey: string; monthLabel: string; total: number; count: number }>();

    for (const row of approvedGrantHistory) {
      if (!row.approvedDate) {
        continue;
      }

      const monthKey = format(row.approvedDate, "yyyy-MM");
      const monthLabel = format(row.approvedDate, "MMM yyyy");
      const existing = monthlyMap.get(monthKey);
      if (existing) {
        existing.total += row.approvedAmount;
        existing.count += 1;
      } else {
        monthlyMap.set(monthKey, {
          monthKey,
          monthLabel,
          total: row.approvedAmount,
          count: 1,
        });
      }
    }

    return Array.from(monthlyMap.values())
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
      .map((entry) => ({
        month: entry.monthLabel,
        total: entry.total,
        count: entry.count,
      }));
  }, [approvedGrantHistory]);

  const chaptersWithoutRequests = useMemo(() => {
    return chapterFundingAggregates.values.filter((entry) => entry.totalRequests === 0);
  }, [chapterFundingAggregates.values]);

  const topLeaderboardRows = useMemo(() => chapterFundingAggregates.values.slice(0, 12), [chapterFundingAggregates.values]);

  const maxLeaderboardRequested = useMemo(
    () => topLeaderboardRows.reduce((maxValue, row) => Math.max(maxValue, row.requestedTotal), 0),
    [topLeaderboardRows],
  );

  const maxLeaderboardGiven = useMemo(
    () => topLeaderboardRows.reduce((maxValue, row) => Math.max(maxValue, row.approvedTotal), 0),
    [topLeaderboardRows],
  );

  const chaptersWithoutRequestsPagination = usePagination(chaptersWithoutRequests, {
    pageSize: 8,
    resetKey: `no-requests-${chaptersWithoutRequests.length}`,
  });

  const grantHistoryPagination = usePagination(approvedGrantHistory, {
    pageSize: 8,
    resetKey: `grant-history-${approvedGrantHistory.length}`,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Funding Request Analytics
              </CardTitle>
              <CardDescription>
                Funding trends, chapter comparisons, budget history, and approval/rejection insights.
              </CardDescription>
            </div>
            <div className="w-full md:w-[280px]">
              <Popover open={chapterFilterOpen} onOpenChange={setChapterFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={chapterFilterOpen}
                    className="w-full justify-between"
                    data-testid="select-funding-analytics-chapter"
                  >
                    <span className="truncate">{selectedChapterLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search chapter..." data-testid="input-funding-analytics-chapter-search" />
                    <CommandList>
                      <CommandEmpty>No chapter found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="All Chapters"
                          onSelect={() => {
                            setSelectedChapterId(CHAPTER_FILTER_ALL);
                            setChapterFilterOpen(false);
                          }}
                          data-testid="option-funding-analytics-all-chapters"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedChapterId === CHAPTER_FILTER_ALL ? "opacity-100" : "opacity-0",
                            )}
                          />
                          All Chapters
                        </CommandItem>
                        {sortedChapters.map((chapter) => (
                          <CommandItem
                            key={chapter.id}
                            value={chapter.name}
                            onSelect={() => {
                              setSelectedChapterId(chapter.id);
                              setChapterFilterOpen(false);
                            }}
                            data-testid={`option-funding-analytics-chapter-${chapter.id}`}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedChapterId === chapter.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {chapter.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Selected Chapter Requested</p>
                <p className="mt-2 text-lg font-semibold" data-testid="text-selected-chapter-requested">
                  {formatCurrency(selectedChapterSummary?.requestedTotal || 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedChapterSummary ? selectedChapterSummary.chapterName : "Choose a chapter from the filter"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Selected Chapter Gotten</p>
                <p className="mt-2 text-lg font-semibold text-green-600" data-testid="text-selected-chapter-given">
                  {formatCurrency(selectedChapterSummary?.approvedTotal || 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Based on approved funding requests</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Money We Have Given</p>
                <p className="mt-2 text-lg font-semibold" data-testid="text-total-given">
                  {formatCurrency(totals.totalGiven)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Total approved budget for all chapters</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cumulative Amount Requested</p>
                <p className="mt-2 text-lg font-semibold" data-testid="text-total-requested">
                  {formatCurrency(totals.totalRequested)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">All chapter funding requests combined</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Outstanding Requested Funds</p>
                <p className="mt-2 text-lg font-semibold" data-testid="text-outstanding-requested">
                  {formatCurrency(totals.outstandingRequested)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Largest request: {formatCurrency(largestRequestedFund?.amount || 0)}
                  {largestRequestedFund
                    ? ` (${largestRequestedFund.request.proposedActivityName || "Unnamed Request"})`
                    : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Outstanding Given Funds</p>
                <p className="mt-2 text-lg font-semibold text-green-600" data-testid="text-outstanding-given">
                  {formatCurrency(totals.outstandingGiven)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Largest given: {formatCurrency(largestGivenFund?.amount || 0)}
                  {largestGivenFund
                    ? ` (${largestGivenFund.request.proposedActivityName || "Unnamed Request"})`
                    : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Top Requester</p>
                <p className="mt-2 text-sm font-semibold">{topRequester?.chapterName || "No data"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(topRequester?.requestedTotal || 0)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Top Budget Given</p>
                <p className="mt-2 text-sm font-semibold">{topBudgetGiven?.chapterName || "No data"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(topBudgetGiven?.approvedTotal || 0)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Top Approved</p>
                <p className="mt-2 text-sm font-semibold">{topApproved?.chapterName || "No data"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{topApproved?.approvedCount || 0} approved requests</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Top Rejected</p>
                <p className="mt-2 text-sm font-semibold">{topRejected?.chapterName || "No data"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{topRejected?.rejectedCount || 0} rejected requests</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Most Rejected Amount Range</p>
                <p className="mt-2 text-sm font-semibold">{mostRejectedBucket?.label || "No rejected amount data"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{mostRejectedBucket?.count || 0} rejected requests</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Top Chapters: Requested vs Given
            </CardTitle>
            <CardDescription>Top 8 chapters by requested budget</CardDescription>
          </CardHeader>
          <CardContent>
            {chapterRequestedVsGivenChartData.length === 0 ? (
              <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No chart data yet.
              </div>
            ) : (
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[460px]">
                {chapterRequestedVsGivenChartData.map((row, index) => {
                  const requestedWidth =
                    maxTopRequested > 0 ? Math.max(6, Math.round((row.requested / maxTopRequested) * 100)) : 0;
                  const approvedWidth =
                    maxTopApproved > 0 ? Math.max(6, Math.round((row.approved / maxTopApproved) * 100)) : 0;

                  return (
                    <div key={`${row.chapterName}-${index}`} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold">
                          #{index + 1} {row.chapterName}
                        </p>
                        <Badge variant="outline" className="shrink-0">
                          Rank {index + 1}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Requested</span>
                            <span className="font-medium">{formatCurrency(row.requested)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${requestedWidth}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Given</span>
                            <span className="font-medium text-green-600">{formatCurrency(row.approved)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-green-500"
                              style={{ width: `${approvedWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4" />
              Request Status Breakdown
            </CardTitle>
            <CardDescription>Funding requests by moderation status</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.every((item) => item.count === 0) ? (
              <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No status data yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                <ChartContainer config={analyticsChartConfig} className="h-[250px] w-full min-w-0 aspect-auto">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="status" />} />
                    <Pie data={statusChartData} dataKey="count" nameKey="status" innerRadius="42%" outerRadius="80%" paddingAngle={2}>
                      {statusChartData.map((entry, index) => (
                        <Cell key={`funding-status-${entry.key}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-2">
                  {statusChartData.map((item, index) => (
                    <div key={item.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        {item.status}
                      </span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4" />
              Rejected Amount Analytics
            </CardTitle>
            <CardDescription>Requested amount ranges that are mostly rejected</CardDescription>
          </CardHeader>
          <CardContent>
            {rejectedAmountBuckets.every((item) => item.count === 0) ? (
              <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No rejected amount data yet.
              </div>
            ) : (
              <ChartContainer config={analyticsChartConfig} className="h-[250px] w-full min-w-0 aspect-auto">
                <BarChart data={rejectedAmountBuckets} margin={{ left: 4, right: 4, top: 10, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={6} maxBarSize={42} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              History of Given Funds
            </CardTitle>
            <CardDescription>Monthly trend of approved funding</CardDescription>
          </CardHeader>
          <CardContent>
            {givenHistoryTrend.length === 0 ? (
              <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No approved grant history yet.
              </div>
            ) : (
              <ChartContainer config={analyticsChartConfig} className="h-[250px] w-full min-w-0 aspect-auto">
                <LineChart data={givenHistoryTrend} margin={{ left: 4, right: 4, top: 10, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={34} tick={{ fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-4 w-4" />
            Chapter Funding Leaderboard
          </CardTitle>
          <CardDescription>Requested and approved budget totals by chapter</CardDescription>
        </CardHeader>
        <CardContent>
          {topLeaderboardRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chapter records available.</p>
          ) : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[460px]">
              {topLeaderboardRows.map((entry, index) => {
                const requestedFillPercent =
                  maxLeaderboardRequested > 0
                    ? Math.max(6, Math.round((entry.requestedTotal / maxLeaderboardRequested) * 100))
                    : 0;
                const givenFillPercent =
                  maxLeaderboardGiven > 0
                    ? Math.max(6, Math.round((entry.approvedTotal / maxLeaderboardGiven) * 100))
                    : 0;

                return (
                  <div key={entry.chapterId} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          #{index + 1} {entry.chapterName}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.totalRequests} total funding requests</p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(entry.requestedTotal)}</p>
                        <p className="text-xs text-muted-foreground">requested</p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-muted/30 px-2 py-1 text-xs">
                        <p className="text-muted-foreground">Approved count</p>
                        <p className="font-medium text-foreground">{entry.approvedCount}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2 py-1 text-xs">
                        <p className="text-muted-foreground">Rejected count</p>
                        <p className="font-medium text-foreground">{entry.rejectedCount}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Requested Budget</span>
                          <span className="font-medium">{formatCurrency(entry.requestedTotal)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${requestedFillPercent}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Budget Given</span>
                          <span className="font-medium text-green-600">{formatCurrency(entry.approvedTotal)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-green-500"
                            style={{ width: `${givenFillPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chapters With No Funding Request</CardTitle>
            <CardDescription>Chapters that have not requested any funding yet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chaptersWithoutRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">All chapters have submitted at least one funding request.</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {chaptersWithoutRequestsPagination.paginatedItems.map((chapter) => {
                    const chapterDetails = chapters.find((entry) => entry.id === chapter.chapterId);
                    return (
                      <div key={chapter.chapterId} className="rounded-md border p-3">
                        <p className="text-sm font-semibold">{chapter.chapterName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{chapterDetails?.location || "Unknown location"}</p>
                        <Badge variant="outline" className="mt-3">
                          No request yet
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                <PaginationControls
                  currentPage={chaptersWithoutRequestsPagination.currentPage}
                  totalPages={chaptersWithoutRequestsPagination.totalPages}
                  itemsPerPage={chaptersWithoutRequestsPagination.itemsPerPage}
                  totalItems={chaptersWithoutRequestsPagination.totalItems}
                  startItem={chaptersWithoutRequestsPagination.startItem}
                  endItem={chaptersWithoutRequestsPagination.endItem}
                  onPageChange={chaptersWithoutRequestsPagination.setCurrentPage}
                  onItemsPerPageChange={chaptersWithoutRequestsPagination.setItemsPerPage}
                  itemLabel="chapters"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">History of Given Funds</CardTitle>
            <CardDescription>Approved funding timeline per chapter request</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {approvedGrantHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved funding entries yet.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {grantHistoryPagination.paginatedItems.map((entry) => (
                    <div key={entry.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{entry.chapterName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{entry.activity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(entry.approvedAmount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.approvedDate ? format(entry.approvedDate, "MMM d, yyyy") : "-"}
                          </p>
                        </div>
                      </div>
                      {entry.adminReply && (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">Admin reply: {entry.adminReply}</p>
                      )}
                    </div>
                  ))}
                </div>

                <PaginationControls
                  currentPage={grantHistoryPagination.currentPage}
                  totalPages={grantHistoryPagination.totalPages}
                  itemsPerPage={grantHistoryPagination.itemsPerPage}
                  totalItems={grantHistoryPagination.totalItems}
                  startItem={grantHistoryPagination.startItem}
                  endItem={grantHistoryPagination.endItem}
                  onPageChange={grantHistoryPagination.setCurrentPage}
                  onItemsPerPageChange={grantHistoryPagination.setItemsPerPage}
                  itemLabel="approved grants"
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
