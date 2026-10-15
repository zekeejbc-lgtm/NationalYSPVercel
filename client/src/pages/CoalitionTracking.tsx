import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  ShieldCheck,
  Loader2,
  RefreshCw,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  COALITION_STATUS_LABELS,
  type CoalitionTracking,
} from "@shared/coalition";

export default function CoalitionTrackingPage() {
  const [link] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)),
  );
  const [verifying, setVerifying] = useState(link.has("token"));
  const [closed, setClosed] = useState(false);
  const [reference, setReference] = useState(link.get("reference") || "");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const {
    data,
    error: queryError,
    isLoading,
    refetch,
  } = useQuery<CoalitionTracking>({
    queryKey: ["/api/coalition/tracking/application"],
    enabled: !verifying && !closed,
    retry: false,
    refetchInterval: 30000,
  });
  useEffect(() => {
    const token = link.get("token");
    if (!token) return;
    // Secrets stay out of URL queries, server logs, history and browser storage.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    let cancelled = false;
    apiRequest("POST", "/api/coalition/tracking/access", {
      reference: link.get("reference"),
      token,
    })
      .then(() => {
        if (!cancelled) {
          queryClient.removeQueries({
            queryKey: ["/api/coalition/tracking/application"],
          });
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);
  async function recover(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest(
        "POST",
        "/api/coalition/tracking/recover",
        { reference: reference.trim(), email: email.trim() },
      );
      setMessage(result.message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to request a link. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "respond" | "withdraw") {
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", "/api/coalition/tracking/action", {
        action,
        message: response,
      });
      setResponse("");
      setWithdrawOpen(false);
      await refetch();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update your application.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/coalition/tracking/logout");
      setClosed(true);
      queryClient.removeQueries({
        queryKey: ["/api/coalition/tracking/application"],
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to close your session.",
      );
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string) =>
    new Date(value).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <div className="min-h-screen bg-muted/30 py-12 md:py-16">
      <div className="max-w-3xl mx-auto px-4 md:px-8 space-y-6">
        <div className="text-center">
          <ClipboardList className="h-10 w-10 text-primary mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Track your coalition application
          </h1>
          <p className="text-muted-foreground">
            Follow your progress and read updates from the national team.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-card p-4 text-destructive text-sm"
          >
            {error.replace(/^\d+:\s*/, "")}
          </p>
        )}
        {verifying || (isLoading && !closed) ? (
          <Card>
            <CardContent
              className="p-8 flex items-center justify-center gap-3"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              {verifying
                ? "Verifying your private link…"
                : "Loading your application…"}
            </CardContent>
          </Card>
        ) : data && !closed && !queryError ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{data.name}</CardTitle>
                  <Badge variant="secondary">
                    {COALITION_STATUS_LABELS[data.status]}
                  </Badge>
                </div>
                <CardDescription>
                  {data.registrationType === "organization"
                    ? "Organization"
                    : "Individual"}{" "}
                  application · Submitted {date(data.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="font-mono text-sm break-all">
                  Reference: {data.reference}
                </p>
                <div className="rounded-lg border bg-primary/5 p-4 text-sm">
                  {data.status === "approved"
                    ? "Your application has been approved by national administration. Read the updates below for next steps."
                    : data.status === "needs_information"
                      ? "The national team needs more information. Read their message below and send your response."
                      : data.status === "declined"
                        ? "Your application was declined. Read the national team's explanation below."
                        : data.status === "withdrawn"
                          ? "This application has been withdrawn."
                          : "Your application is awaiting a decision from national administration. This page refreshes automatically."}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={busy}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh progress
                  </Button>
                  <Button variant="ghost" onClick={logout} disabled={busy}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Close private session
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Application history</CardTitle>
                <CardDescription>
                  Your updates and messages from national administration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-6 border-l border-primary/30 ml-2 pl-6">
                  {data.events.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                      <p className="font-semibold">
                        {COALITION_STATUS_LABELS[item.status]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {date(item.createdAt)} ·{" "}
                        {item.actor === "admin"
                          ? "National administration"
                          : item.actor === "applicant"
                            ? "You"
                            : "Registration received"}
                      </p>
                      <p className="text-sm mt-2 whitespace-pre-wrap break-words">
                        {item.message}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            {data.status === "needs_information" && (
              <Card>
                <CardHeader>
                  <CardTitle>Send the requested information</CardTitle>
                  <CardDescription>
                    Your response will be visible to national administrators.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("respond");
                    }}
                    className="space-y-4"
                  >
                    <Label htmlFor="tracking-response">Your response</Label>
                    <Textarea
                      id="tracking-response"
                      required
                      minLength={5}
                      maxLength={2000}
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder="Provide the details requested by the national team. Avoid sending IDs or sensitive documents here."
                    />
                    <Button type="submit" disabled={busy}>
                      {busy && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Send response
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
            {data.status !== "withdrawn" && (
              <div className="text-right">
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => setWithdrawOpen(true)}
                >
                  Withdraw application
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Private application access
              </CardTitle>
              <CardDescription>
                Open the private link saved on your submission receipt, or
                request a verification link using your reference and the email
                you registered with.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queryError && !String(queryError).includes("401:") && (
                <div className="text-sm text-destructive mb-4" role="alert">
                  Unable to load your progress.{" "}
                  <Button variant="ghost" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              <form onSubmit={recover} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tracking-reference">
                    Registration reference
                  </Label>
                  <Input
                    id="tracking-reference"
                    required
                    value={reference}
                    maxLength={40}
                    placeholder="YSC-7K4M-9Q2P-6T8R"
                    onChange={(e) => setReference(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tracking-email">
                    Registered email address
                  </Label>
                  <Input
                    id="tracking-email"
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-11"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Email me a verification link
                </Button>
              </form>
              {message && (
                <p
                  role="status"
                  className="text-sm mt-4 rounded-lg bg-primary/5 p-4 flex gap-2"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  {message}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/coalition-signup"
            className="text-primary hover:underline"
          >
            Register for the coalition
          </Link>{" "}
          ·{" "}
          <Link href="/contact" className="hover:underline">
            Contact the national team
          </Link>
        </p>
        <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw your application?</AlertDialogTitle>
              <AlertDialogDescription>
                This ends the review of your current application. National
                administrators will see that you withdrew it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                Keep application
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void act("withdraw");
                }}
              >
                Withdraw application
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
