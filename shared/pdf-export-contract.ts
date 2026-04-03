import { z } from "zod";

export type PdfGenerationMode = "client" | "server" | "hybrid";

export type PdfTimestampPolicy = {
  timezone: "Asia/Manila" | "UTC" | string;
  format: "long-12h" | "short-12h" | "iso";
};

export type PdfFilenamePolicy = {
  prefix: string;
  includeChapterToken?: boolean;
  includeYear?: boolean;
  includeQuarter?: boolean;
  includeDateStamp?: boolean;
};

export type PdfBrandingProfile = {
  organizationName: string;
  legalName: string;
  secRegistryNumber: string;
  logoPath?: string;
  facebook?: string;
  website?: string;
  email?: string;
};

export type PdfLayoutProfile = {
  format: "a4" | "letter";
  orientation: "portrait" | "landscape";
  marginX: number;
  headerEnabled: boolean;
  footerEnabled: boolean;
  pageNumbersEnabled: boolean;
};

export type PdfExportContract = {
  reportId: string;
  purpose: string;
  title: string;
  subtitle?: string;
  generationMode: PdfGenerationMode;
  selectedSections: Record<string, boolean>;
  selectedColumns: Record<string, boolean>;
  filters: Record<string, string | number | boolean | null | undefined>;
  brandingProfile: PdfBrandingProfile;
  layoutProfile: PdfLayoutProfile;
  timestampPolicy: PdfTimestampPolicy;
  filenamePolicy: PdfFilenamePolicy;
  snapshotMetadata: {
    actorRole?: string;
    chapterId?: string;
    barangayId?: string;
    exportedAtIso: string;
    source: "ui" | "api";
  };
};

const pdfGenerationModeSchema = z.enum(["client", "server", "hybrid"]);
const pdfTimestampFormatSchema = z.enum(["long-12h", "short-12h", "iso"]);
const pdfPageFormatSchema = z.enum(["a4", "letter"]);
const pdfOrientationSchema = z.enum(["portrait", "landscape"]);
const pdfSourceSchema = z.enum(["ui", "api"]);

const booleanRecordSchema = z.record(z.boolean());
const filterRecordSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const pdfExportContractSchema = z
  .object({
    reportId: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(220),
    subtitle: z.string().trim().max(260).optional(),
    generationMode: pdfGenerationModeSchema,
    selectedSections: booleanRecordSchema,
    selectedColumns: booleanRecordSchema,
    filters: filterRecordSchema,
    brandingProfile: z.object({
      organizationName: z.string().trim().min(1).max(180),
      legalName: z.string().trim().min(1).max(220),
      secRegistryNumber: z.string().trim().min(1).max(120),
      logoPath: z.string().trim().max(500).optional(),
      facebook: z.string().trim().max(300).optional(),
      website: z.string().trim().max(300).optional(),
      email: z.string().trim().max(300).optional(),
    }),
    layoutProfile: z.object({
      format: pdfPageFormatSchema,
      orientation: pdfOrientationSchema,
      marginX: z.number().finite().min(0).max(300),
      headerEnabled: z.boolean(),
      footerEnabled: z.boolean(),
      pageNumbersEnabled: z.boolean(),
    }),
    timestampPolicy: z.object({
      timezone: z.string().trim().min(1).max(120),
      format: pdfTimestampFormatSchema,
    }),
    filenamePolicy: z.object({
      prefix: z.string().trim().min(1).max(120),
      includeChapterToken: z.boolean().optional(),
      includeYear: z.boolean().optional(),
      includeQuarter: z.boolean().optional(),
      includeDateStamp: z.boolean().optional(),
    }),
    snapshotMetadata: z.object({
      actorRole: z.string().trim().max(50).optional(),
      chapterId: z.string().trim().max(120).optional(),
      barangayId: z.string().trim().max(120).optional(),
      exportedAtIso: z.string().datetime({ offset: true }),
      source: pdfSourceSchema,
    }),
  })
  .superRefine((value, context) => {
    const hasAnySelectedSection = Object.values(value.selectedSections).some(Boolean);
    if (!hasAnySelectedSection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one selectedSections entry must be true",
        path: ["selectedSections"],
      });
    }
  });

export function parsePdfExportContract(input: unknown): PdfExportContract {
  return pdfExportContractSchema.parse(input) as PdfExportContract;
}

export function safeParsePdfExportContract(input: unknown) {
  return pdfExportContractSchema.safeParse(input);
}
