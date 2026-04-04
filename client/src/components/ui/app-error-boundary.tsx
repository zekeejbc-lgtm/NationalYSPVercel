import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] Render failure", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Something went wrong while loading this page</CardTitle>
            <CardDescription>
              The app recovered from a rendering error. You can retry without losing your active session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{this.state.message}</p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button onClick={this.handleReload} data-testid="button-app-reload">
              Reload page
            </Button>
            <Button variant="outline" onClick={this.handleGoHome} data-testid="button-app-home">
              Go to home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}
