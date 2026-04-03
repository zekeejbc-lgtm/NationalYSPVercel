import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Award, TrendingUp, Crown } from "lucide-react";

interface LeaderboardEntry {
  chapterId: string;
  chapterName: string;
  score: number;
  completedKpis: number;
}

interface EnhancedLeaderboardProps {
  currentChapterId?: string;
}

export default function EnhancedLeaderboard({ currentChapterId }: EnhancedLeaderboardProps) {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [viewTab, setViewTab] = useState("yearly");

  const { data: yearlyLeaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", { timeframe: "all", year: selectedYear }],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?timeframe=all&year=${selectedYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  const { data: quarterlyLeaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", { timeframe: "quarterly", year: selectedYear, quarter: selectedQuarter }],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?timeframe=quarterly&year=${selectedYear}&quarter=${selectedQuarter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);
  const quarters = [1, 2, 3, 4];

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-slate-400 dark:text-slate-300" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-muted-foreground">{rank}</span>;
    }
  };

  const getRankBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-yellow-500 text-zinc-900";
      case 2:
        return "bg-slate-300 text-zinc-900 dark:bg-slate-400";
      case 3:
        return "bg-amber-600 text-white";
      default:
        return "";
    }
  };

  const renderLeaderboard = (data: LeaderboardEntry[]) => {
    if (data.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No rankings available yet. Complete KPIs to appear on the leaderboard!
        </div>
      );
    }

    const sortedData = [...data].sort((a, b) => b.score - a.score);
    const maxScore = sortedData[0]?.score || 1;

    return (
      <div className="space-y-3">
        {sortedData.slice(0, 10).map((entry, index) => {
          const rank = index + 1;
          const isCurrentChapter = entry.chapterId === currentChapterId;
          const progressPercent = maxScore > 0 ? Math.round((entry.score / maxScore) * 100) : 0;
          
          return (
            <div 
              key={entry.chapterId} 
              className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                isCurrentChapter 
                  ? 'bg-primary/10 border-primary ring-2 ring-primary/30' 
                  : 'hover-elevate'
              } ${rank <= 3 ? 'border-2' : ''}`}
              style={rank <= 3 ? { borderColor: rank === 1 ? '#eab308' : rank === 2 ? '#9ca3af' : '#d97706' } : {}}
            >
              <div className="flex items-center justify-center w-12">
                {getRankIcon(rank)}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${rank === 1 ? 'text-lg' : ''}`}>
                    {entry.chapterName}
                  </span>
                  {isCurrentChapter && <Badge variant="secondary">You</Badge>}
                  {rank <= 3 && <Badge className={getRankBadgeColor(rank)}>
                    {rank === 1 ? "Champion" : rank === 2 ? "2nd Place" : "3rd Place"}
                  </Badge>}
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <div 
                    className="h-2 bg-primary/30 rounded-full flex-1 max-w-64"
                    style={{ background: `linear-gradient(90deg, var(--primary) ${progressPercent}%, var(--muted) ${progressPercent}%)` }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {entry.completedKpis} KPIs completed
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold text-primary">{entry.score}</span>
                <span className="text-sm text-muted-foreground">pts</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const currentChapterYearlyRank = yearlyLeaderboard.findIndex(e => e.chapterId === currentChapterId) + 1;
  const currentChapterQuarterlyRank = quarterlyLeaderboard.findIndex(e => e.chapterId === currentChapterId) + 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Chapter Leaderboard
        </CardTitle>
        <CardDescription>
          Rankings based on completed KPIs. Complete more KPIs to climb the leaderboard!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentChapterId && (currentChapterYearlyRank > 0 || currentChapterQuarterlyRank > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 bg-primary/5">
              <div className="text-sm text-muted-foreground">Your Yearly Rank</div>
              <div className="text-3xl font-bold text-primary">
                {currentChapterYearlyRank > 0 ? `#${currentChapterYearlyRank}` : "-"}
              </div>
            </Card>
            <Card className="p-4 bg-primary/5">
              <div className="text-sm text-muted-foreground">Your Q{selectedQuarter} Rank</div>
              <div className="text-3xl font-bold text-primary">
                {currentChapterQuarterlyRank > 0 ? `#${currentChapterQuarterlyRank}` : "-"}
              </div>
            </Card>
          </div>
        )}

        <div className="flex items-end gap-4 flex-wrap">
          <div className="w-28">
            <Label>Year</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger data-testid="select-leaderboard-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {viewTab === "quarterly" && (
            <div className="w-28">
              <Label>Quarter</Label>
              <Select value={String(selectedQuarter)} onValueChange={(v) => setSelectedQuarter(parseInt(v))}>
                <SelectTrigger data-testid="select-leaderboard-quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quarters.map((q) => (
                    <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="yearly" data-testid="tab-yearly-leaderboard">
              Yearly Rankings
            </TabsTrigger>
            <TabsTrigger value="quarterly" data-testid="tab-quarterly-leaderboard">
              Q{selectedQuarter} Rankings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="yearly" className="mt-4">
            {renderLeaderboard(yearlyLeaderboard)}
          </TabsContent>

          <TabsContent value="quarterly" className="mt-4">
            {renderLeaderboard(quarterlyLeaderboard)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
