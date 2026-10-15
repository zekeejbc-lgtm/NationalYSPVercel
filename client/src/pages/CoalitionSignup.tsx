import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  Building2,
  UserRound,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COALITION_NOTICE_VERSION,
  COALITION_RETENTION_MONTHS,
  coalitionSignupSchema,
} from "@shared/coalition";

const initialFields = {
  fullName: "",
  organizationName: "",
  organizationType: "",
  representativeName: "",
  representativePosition: "",
  email: "",
  contactNumber: "",
  city: "",
  province: "",
  organizationLink: "",
  website: "",
};
type Field = keyof typeof initialFields;
export default function CoalitionSignup() {
  const [type, setType] = useState<"individual" | "organization">(() =>
    new URLSearchParams(window.location.search).get("type") === "organization"
      ? "organization"
      : "individual",
  );
  const [fields, setFields] = useState(initialFields);
  const [consent, setConsent] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setFieldErrors({});
    const parsed = coalitionSignupSchema.safeParse({
      ...fields,
      requestId,
      registrationType: type,
      privacyConsent: consent,
      authorizedRepresentative: authorized,
      noticeVersion: COALITION_NOTICE_VERSION,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        errors[String(issue.path[0])] = issue.message;
      });
      setFieldErrors(errors);
      setError(
        parsed.error.issues[0]?.message ||
          "Please review the form before submitting.",
      );
      document
        .getElementById(`coalition-${parsed.error.issues[0].path[0]}`)
        ?.focus();
      return;
    }
    setPending(true);
    try {
      // The apex domain redirects to www. Using the canonical API origin avoids
      // a 307 round trip and prevents browsers from treating the redirect as a
      // cross-origin request.
      const apiOrigin =
        window.location.hostname === "youthserviceph.org"
          ? "https://www.youthserviceph.org"
          : "";
      const response = await fetch(`${apiOrigin}/api/coalition/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const responseText = await response.text();
      let result: {
        reference?: string;
        trackingToken?: string;
        emailSent?: boolean;
        error?: string;
        message?: string;
      } = {};
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          responseText.trim().startsWith("<")
            ? "The registration service returned a webpage instead of an API response. Please refresh and try again."
            : "The registration service returned an invalid response. Please try again.",
        );
      }
      if (!response.ok)
        throw new Error(
          result.error || result.message || "Unable to submit. Please try again.",
        );
      if (!result.reference) {
        throw new Error("The registration service did not return a reference. Please try again.");
      }
      setReference(result.reference);
      setTrackingToken(result.trackingToken || "");
      setEmailSent(!!result.emailSent);
      setFields(initialFields);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to connect. Please try again. Your details have been kept.",
      );
    } finally {
      setPending(false);
    }
  }
  function field(
    key: Field,
    label: string,
    required = true,
    inputType = "text",
    autoComplete?: string,
  ) {
    return (
      <div className="space-y-2" key={key}>
        <Label htmlFor={`coalition-${key}`}>
          {label}
          {!required && (
            <span className="text-muted-foreground font-normal">
              {" "}
              (optional)
            </span>
          )}
        </Label>
        <Input
          id={`coalition-${key}`}
          name={key}
          type={inputType}
          autoComplete={autoComplete}
          required={required}
          maxLength={
            key === "organizationLink"
              ? 2048
              : key === "email"
                ? 254
                : key === "contactNumber"
                  ? 30
                  : 120
          }
          value={fields[key]}
          onChange={(e) =>
            setFields((previous) => ({ ...previous, [key]: e.target.value }))
          }
          aria-invalid={!!fieldErrors[key]}
          data-testid={`input-coalition-${key}`}
        />
      </div>
    );
  }
  if (reference)
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-20">
        <Card>
          <CardContent
            className="p-8 md:p-12 text-center space-y-6"
            role="status"
          >
            <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
            <h1 className="text-3xl font-bold">Thank you for signing up!</h1>
            <p className="text-muted-foreground">
              Your Youth Service Coalition registration has been received. Our
              team will use your contact details to coordinate next steps.
            </p>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground mb-2">
                Keep your registration reference
              </p>
              <p
                className="font-mono text-sm break-all"
                data-testid="coalition-reference"
              >
                {reference}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Your application is submitted and awaiting review by national
              administration.
              {emailSent
                ? " A private tracking link has been emailed to you."
                : " Keep your private tracking link below. Email delivery may be delayed."}
            </p>
            {trackingToken && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link
                    href={`/coalition-track#reference=${reference}&token=${trackingToken}`}
                  >
                    Track my application
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/coalition-track#reference=${reference}&token=${trackingToken}`,
                      );
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied
                    ? "Private link copied"
                    : "Copy private tracking link"}
                </Button>
              </div>
            )}
            {!trackingToken && (
              <Button asChild variant="outline">
                <Link href="/coalition-track">Request a tracking link</Link>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Keep the tracking link private. It expires in 7 days; you can
              request a new email verification link afterwards.
            </p>
            <Button asChild>
              <Link href="/">Back to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  return (
    <div className="min-h-screen bg-muted/30 py-12 md:py-16">
      <div className="max-w-3xl mx-auto px-4 md:px-8">
        <Link
          href="/#coalition"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to homepage
        </Link>
        <div className="text-center mb-8">
          <p className="text-primary text-sm uppercase tracking-wider font-semibold mb-3">
            Together in service
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Youth Service Coalition
          </h1>
          <p className="text-muted-foreground text-lg">
            Start with your basic details. Let's build stronger communities
            together.
          </p>
        </div>
        <fieldset disabled={pending} className="grid sm:grid-cols-2 gap-4 mb-6">
          <legend className="sr-only">Choose your registration type</legend>
          {(["individual", "organization"] as const).map((value) => {
            const Icon = value === "individual" ? UserRound : Building2;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                data-testid={`select-coalition-${value}`}
                onClick={() => {
                  setType(value);
                  setConsent(false);
                  setAuthorized(false);
                  setFieldErrors({});
                  setError("");
                }}
                className={`flex items-center gap-3 rounded-lg border p-5 text-left min-h-11 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${type === value ? "border-primary bg-primary/10" : "bg-card hover:bg-accent"}`}
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="font-semibold">
                  Register as{" "}
                  {value === "individual" ? "Individual" : "Organization"}
                </span>
              </button>
            );
          })}
        </fieldset>
        <Card>
          <CardHeader>
            <CardTitle>
              {type === "individual"
                ? "Individual details"
                : "Organization details"}
            </CardTitle>
            <CardDescription>
              Fields marked optional may be left blank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-primary/5 border p-4 mb-6 text-sm">
              <p className="flex items-center gap-2 font-semibold mb-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Your privacy matters
              </p>
              <p className="text-muted-foreground">
                Youth Service Philippines will use these details to record your
                coalition registration and contact you about coalition
                coordination. Your details will not appear in a public
                directory.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="px-0 mt-1 h-auto min-h-11 text-primary underline"
                onClick={() => setPrivacyOpen(true)}
              >
                Read the full privacy notice
              </Button>
            </div>
            <form onSubmit={submit} noValidate className="space-y-6">
              <fieldset disabled={pending} className="space-y-6">
                <legend className="sr-only">Registration details</legend>
                {type === "individual" ? (
                  field("fullName", "Full name", true, "text", "name")
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {field(
                      "organizationName",
                      "Organization name",
                      true,
                      "text",
                      "organization",
                    )}
                    {field("organizationType", "Organization type")}
                    {field(
                      "representativeName",
                      "Representative's full name",
                      true,
                      "text",
                      "name",
                    )}
                    {field(
                      "representativePosition",
                      "Position in organization",
                    )}
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-5">
                  {field(
                    "email",
                    type === "individual"
                      ? "Email address"
                      : "Representative's email address",
                    true,
                    "email",
                    "email",
                  )}
                  {field(
                    "contactNumber",
                    "Contact number",
                    false,
                    "tel",
                    "tel",
                  )}
                  {field(
                    "city",
                    "City / municipality",
                    true,
                    "text",
                    "address-level2",
                  )}
                  {field(
                    "province",
                    "Province / Metro Manila",
                    true,
                    "text",
                    "address-level1",
                  )}
                </div>
                {type === "organization" &&
                  field(
                    "organizationLink",
                    "Website or social media link",
                    false,
                    "url",
                  )}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="coalition-website">Leave this blank</label>
                  <input
                    id="coalition-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={fields.website}
                    onChange={(e) =>
                      setFields((p) => ({ ...p, website: e.target.value }))
                    }
                  />
                </div>
                {type === "organization" && (
                  <div>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="coalition-authorizedRepresentative"
                        checked={authorized}
                        onCheckedChange={(v) => setAuthorized(v === true)}
                        aria-invalid={!!fieldErrors.authorizedRepresentative}
                      />
                      <Label
                        htmlFor="coalition-authorizedRepresentative"
                        className="leading-relaxed"
                      >
                        I am authorized to register and coordinate on behalf of
                        this organization.
                      </Label>
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="coalition-privacyConsent"
                      checked={consent}
                      onCheckedChange={(v) => setConsent(v === true)}
                      aria-invalid={!!fieldErrors.privacyConsent}
                    />
                    <Label
                      htmlFor="coalition-privacyConsent"
                      className="leading-relaxed"
                    >
                      I have read the privacy notice and consent to the
                      collection and use of my information for coalition
                      registration and coordination.
                    </Label>
                  </div>
                </div>
              </fieldset>
              {error && (
                <p
                  role="alert"
                  className="text-sm text-destructive rounded-lg border border-destructive/30 p-3"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={pending}
                className="w-full min-h-11"
                data-testid="submit-coalition"
              >
                {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {pending ? "Submitting registration…" : "Submit registration"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Coalition registration privacy notice</DialogTitle>
              <DialogDescription>
                Youth Service Philippines · Notice version{" "}
                {COALITION_NOTICE_VERSION}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Youth Service Philippines (YSP) is responsible for the personal
                information submitted through this form. For privacy questions,
                access, correction, deletion, or withdrawal of consent, email{" "}
                <a
                  className="text-primary underline"
                  href="mailto:national.hq@youthserviceph.org"
                >
                  national.hq@youthserviceph.org
                </a>{" "}
                and include your registration reference if available.
              </p>
              <p>
                We collect your name or your organization's name and type,
                representative's name and position where applicable, email
                address, city/municipality and province, and any optional phone
                number or organization link you provide. We also record your
                registration reference, consent date, notice version, and
                registration status, review messages, and any replies you send
                through tracking.
              </p>
              <p>
                With your consent, we use this information to record your
                interest in the Youth Service Coalition, review and coordinate
                registrations, make participation decisions, provide private
                progress tracking, and send verification links and status
                updates through Google Apps Script and Google's email
                infrastructure. This consent does not enroll you in unrelated
                marketing or authorize publication of your personal details.
              </p>
              <p>
                Authorized YSP administrators can access registrations.
                Information is stored using the portal's database hosting
                provider, Supabase, and processed through its hosting
                infrastructure. Administrators may export registrations for
                these same purposes; exports must remain restricted to
                authorized personnel. We do not sell your information or publish
                it in a public directory.
              </p>
              <p>
                Registration records are retained for up to{" "}
                {COALITION_RETENTION_MONTHS} months from submission, then
                removed from active registration storage. Expired records are
                excluded from administrator results immediately and deleted
                during the next registration or administrator request. Backups
                may retain copies according to the hosting provider's backup
                lifecycle. Authorized exports must follow the same retention
                period.
              </p>
              <p>
                You may decline consent by leaving the form unsubmitted. You may
                later withdraw consent or request access, correction, or
                deletion by contacting YSP. Withdrawal stops future
                consent-based registration processing and does not affect
                processing already lawfully performed. You may also raise
                concerns with the National Privacy Commission.
              </p>
              <p>
                To protect this form from abuse, we briefly store a pseudonymous
                identifier derived from your network address and a submission
                count. These identifiers are used only for submission limits and
                removed after their one-hour window during the next cleanup. We
                use access controls and encrypted connections to help protect
                your information.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
