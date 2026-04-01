import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Crown, Users } from "lucide-react";

interface LeaderboardEntry {
  barangayId: string;
  barangayName: string;
  memberCount: number;
  rank: number;
}

interface BarangayLeaderboardProps {
  chapterId: string;
  currentBarangayId: string;
}

export default function BarangayLeaderboard({ chapterId, currentBarangayId }: BarangayLeaderboardProps) {
  const { data: leaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/barangay-leaderboard", { chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/barangay-leaderboard?chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-muted-foreground">{rank}</span>;
    }
  };

  const currentBarangayEntry = leaderboard.find(e => e.barangayId === currentBarangayId);
  const topTen = leaderboard.slice(0, 10);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3" role="status" aria-label="Loading leaderboard">
            <div className="h-5 w-48 rounded-md bg-muted skeleton-shimmer" />
            <div className="h-12 w-full rounded-lg bg-muted skeleton-shimmer" />
            <div className="h-12 w-full rounded-lg bg-muted skeleton-shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Barangay Leaderboard
          </CardTitle>
          <CardDescription>
            Rankings based on registered members within your chapter.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          No barangays have registered members yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Barangay Leaderboard
        </CardTitle>
        <CardDescription>
          Top barangays by registered members within your chapter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topTen.map((entry) => {
            const isCurrentBarangay = entry.barangayId === currentBarangayId;
            return (
              <div 
                key={entry.barangayId} 
                className={`flex items-center justify-between p-3 rounded-lg ${isCurrentBarangay ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30 hover-elevate'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 flex justify-center">
                    {getRankIcon(entry.rank)}
                  </div>
                  <span className={`font-medium ${isCurrentBarangay ? 'text-primary' : ''}`}>
                    {entry.barangayName}
                    {isCurrentBarangay && (
                      <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {entry.memberCount} members
                </div>
              </div>
            );
          })}
        </div>

        {currentBarangayEntry && currentBarangayEntry.rank > 10 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">Your Ranking:</p>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-8 flex justify-center">
                  <span className="text-sm font-bold text-muted-foreground">{currentBarangayEntry.rank}</span>
                </div>
                <span className="font-medium text-primary">
                  {currentBarangayEntry.barangayName}
                  <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                {currentBarangayEntry.memberCount} members
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
