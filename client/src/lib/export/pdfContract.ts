import type {
  PdfBrandingProfile,
  PdfExportContract,
  PdfFilenamePolicy,
  PdfGenerationMode,
  PdfLayoutProfile,
  PdfTimestampPolicy,
} from "@shared/pdf-export-contract";
import { parsePdfExportContract } from "@shared/pdf-export-contract";
import { ORGANIZATION_REPORT_INFO } from "@/lib/export/pdfStandards";

const DEFAULT_TIMESTAMP_POLICY: PdfTimestampPolicy = {
  timezone: "Asia/Manila",
  format: "long-12h",
};

const DEFAULT_LAYOUT_PROFILE: PdfLayoutProfile = {
  format: "a4",
  orientation: "portrait",
  marginX: 40,
  headerEnabled: true,
  footerEnabled: true,
  pageNumbersEnabled: true,
};

const DEFAULT_BRANDING_PROFILE: PdfBrandingProfile = {
  organizationName: ORGANIZATION_REPORT_INFO.name,
  legalName: ORGANIZATION_REPORT_INFO.fullGovernmentName,
  secRegistryNumber: ORGANIZATION_REPORT_INFO.secRegistryNumber,
  logoPath: ORGANIZATION_REPORT_INFO.logoPath,
  facebook: ORGANIZATION_REPORT_INFO.facebook,
  website: ORGANIZATION_REPORT_INFO.website,
  email: ORGANIZATION_REPORT_INFO.email,
};

type CreatePdfExportContractOptions = {
  reportId: string;
  purpose: string;
  title: string;
  subtitle?: string;
  generationMode?: PdfGenerationMode;
  selectedSections: Record<string, boolean>;
  selectedColumns?: Record<string, boolean>;
  filters?: Record<string, string | number | boolean | null | undefined>;
  filenamePolicy: PdfFilenamePolicy;
  snapshotMetadata?: Partial<PdfExportContract["snapshotMetadata"]>;
};

export function createPdfExportContract(options: CreatePdfExportContractOptions): PdfExportContract {
  const {
    reportId,
    purpose,
    title,
    subtitle,
    generationMode = "client",
    selectedSections,
    selectedColumns = {},
    filters = {},
    filenamePolicy,
    snapshotMetadata,
  } = options;

  const normalizedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );

  return parsePdfExportContract({
    reportId,
    purpose,
    title,
    subtitle,
    generationMode,
    selectedSections,
    selectedColumns,
    filters: normalizedFilters,
    brandingProfile: DEFAULT_BRANDING_PROFILE,
    layoutProfile: DEFAULT_LAYOUT_PROFILE,
    timestampPolicy: DEFAULT_TIMESTAMP_POLICY,
    filenamePolicy,
    snapshotMetadata: {
      exportedAtIso: new Date().toISOString(),
      source: "ui",
      ...snapshotMetadata,
    },
  });
}
