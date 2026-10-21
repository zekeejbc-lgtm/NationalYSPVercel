import { z } from "zod";

export const COALITION_NOTICE_VERSION = "2026-10-21-v3";
export const COALITION_RETENTION_MONTHS = 12;
export const COALITION_CERTIFICATE_MAX_BYTES = 3 * 1024 * 1024;
export const YORP_STATUS_LABELS = {
  registered: "Registered",
  pending: "Application pending",
  not_registered: "Not registered",
} as const;
export const ORGANIZATION_REGISTRATION_LABELS = {
  sec: "SEC",
  bir: "BIR",
  lgu_lydo: "LGU / LYDO registration or recognition",
  school: "School recognition",
  other: "Other",
  none: "None",
} as const;
const organizationRegistrationSchema = z.enum(["sec", "bir", "lgu_lydo", "school", "other", "none"]);
const requiredText = z
  .string()
  .trim()
  .min(2, "Please enter at least two characters.")
  .max(120);
const common = {
  requestId: z.string().uuid(),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
  city: requiredText,
  province: requiredText,
  contactNumber: z
    .string()
    .trim()
    .max(30)
    .refine(
      (v) => !v || /^[+\d\s().-]{7,30}$/.test(v),
      "Please enter a valid contact number.",
    )
    .default(""),
  privacyConsent: z.literal(true, {
    errorMap: () => ({
      message: "Please read the privacy notice and give your consent.",
    }),
  }),
  noticeVersion: z.literal(COALITION_NOTICE_VERSION),
  website: z.string().max(0, "Unable to submit this registration.").default(""), // Honeypot; never stored.
};
export const coalitionSignupSchema = z.discriminatedUnion("registrationType", [
  z.object({
    ...common,
    registrationType: z.literal("individual"),
    fullName: requiredText,
  }),
  z.object({
    ...common,
    registrationType: z.literal("organization"),
    organizationName: requiredText,
    organizationType: requiredText,
    yorpStatus: z.enum(["registered", "pending", "not_registered"]).optional(),
    yorpRegistrationNumber: z.string().trim().max(120).default(""),
    otherRegistrations: z.array(organizationRegistrationSchema).max(6).default([])
      .refine((values) => new Set(values).size === values.length && (!values.includes("none") || values.length === 1), "Select None on its own, or select the registrations that apply."),
    otherRegistrationDetails: z.string().trim().max(250).default(""),
    representativeName: requiredText,
    representativePosition: requiredText,
    organizationLink: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (v) =>
          !v ||
          (/^https?:\/\//i.test(v) && z.string().url().safeParse(v).success),
        "Enter a full http:// or https:// link.",
      )
      .default(""),
    authorizedRepresentative: z.literal(true, {
      errorMap: () => ({
        message:
          "Please confirm you are authorized to represent your organization.",
      }),
    }),
  }),
]).superRefine((data, context) => {
  if (data.registrationType !== "organization") return;
  if (data.yorpStatus !== "registered" && data.yorpRegistrationNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["yorpRegistrationNumber"], message: "A YORP number can only be supplied for a registered organization." });
  }
  if (!data.otherRegistrations.includes("other") && data.otherRegistrationDetails) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["otherRegistrationDetails"], message: "Select Other to provide additional registration details." });
  }
});
export type CoalitionSignup = z.infer<typeof coalitionSignupSchema>;
export const coalitionStatusSchema = z.enum([
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "declined",
  "withdrawn",
]);
export type CoalitionStatus = z.infer<typeof coalitionStatusSchema>;
export const COALITION_STATUS_LABELS: Record<CoalitionStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  needs_information: "Needs information",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
export const COALITION_TRANSITIONS: Record<CoalitionStatus, CoalitionStatus[]> =
  {
    submitted: ["under_review", "needs_information", "declined", "withdrawn"],
    under_review: ["needs_information", "approved", "declined", "withdrawn"],
    needs_information: ["under_review", "declined", "withdrawn"],
    approved: ["withdrawn"],
    declined: ["under_review", "withdrawn"],
    withdrawn: [],
  };
export interface CoalitionEvent {
  id: string;
  status: CoalitionStatus;
  message: string;
  actor: "admin" | "applicant" | "system";
  createdAt: string;
}
export interface CoalitionTracking {
  reference: string;
  name: string;
  registrationType: "individual" | "organization";
  status: CoalitionStatus;
  createdAt: string;
  events: CoalitionEvent[];
}
export interface CoalitionRegistration {
  id: string;
  referenceCode: string;
  registrationType: "individual" | "organization";
  fullName: string | null;
  organizationName: string | null;
  organizationType: string | null;
  yorpStatus: keyof typeof YORP_STATUS_LABELS | null;
  yorpRegistrationNumber: string | null;
  otherRegistrations: (keyof typeof ORGANIZATION_REGISTRATION_LABELS)[];
  otherRegistrationDetails: string | null;
  hasYorpCertificate: boolean;
  representativeName: string | null;
  representativePosition: string | null;
  organizationLink: string | null;
  email: string;
  contactNumber: string;
  city: string;
  province: string;
  noticeVersion: string;
  consentedAt: string;
  status: CoalitionStatus;
  createdAt: string;
  updatedAt: string;
}
