import { z } from "zod";

export const COALITION_NOTICE_VERSION = "2026-10-15-v2";
export const COALITION_RETENTION_MONTHS = 12;
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
]);
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
