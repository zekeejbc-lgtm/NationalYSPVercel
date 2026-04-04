import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type SessionRecoveryPanelProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry: () => void;
  onGoToLogin?: () => void;
};

export default function SessionRecoveryPanel({
  title = "Unable to verify your session",
  message,
  retryLabel = "Retry",
  onRetry,
  onGoToLogin,
}: SessionRecoveryPanelProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Your account session may still be active. Retry first before signing in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={onRetry} data-testid="button-session-retry">
            {retryLabel}
          </Button>
          {onGoToLogin ? (
            <Button variant="outline" onClick={onGoToLogin} data-testid="button-session-go-login">
              Go to Login
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
