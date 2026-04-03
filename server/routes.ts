import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hasDatabaseUrl, pool } from "./db";
import multer from "multer";
import fs from "node:fs";
import path from "path";
import bcrypt from "bcryptjs";
import { ensureUploadsDir } from "./upload-path";
import { 
  insertProgramSchema,
  insertChapterSchema,
  insertVolunteerOpportunitySchema,
  insertStatsSchema,
  insertContactInfoSchema,
  insertPublicationSchema,
  insertProjectReportSchema,
  insertChapterUserSchema,
  insertBarangayUserSchema,
  insertChapterKpiSchema,
  insertMemberSchema,
  insertChapterOfficerSchema,
  insertKpiTemplateSchema,
  insertKpiCompletionSchema,
  insertImportantDocumentSchema,
  insertMouSubmissionSchema,
  insertChapterRequestSchema,
  insertNationalRequestSchema
} from "@shared/schema";
import { fromError } from "zod-validation-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isAutoDependencyTemplate, syncAutoDependencyKpiCompletions } from "./kpi-dependency-service";
import {
  evaluateKpiDependencyRule,
  formatKpiDependencyRuleDescription,
  KPI_DEPENDENCY_METRIC_LABELS,
  KPI_DEPENDENCY_OPERATOR_LABELS,
  parseKpiDependencyConfig,
  summarizeKpiDependencyConfig,
  type KpiDependencyMetric,
} from "@shared/kpi-dependencies";
import { parsePdfExportContract, type PdfExportContract } from "@shared/pdf-export-contract";
import {
  getPdfFallbackAuditEntryById,
  getPdfFallbackInternalEntryById,
  listPdfFallbackAuditEntries,
  registerAcceptedPdfFallback,
  registerRejectedPdfFallback,
} from "./pdf-fallback-service";

const REQUIRED_PUBLIC_TABLES = ["programs", "chapters", "stats"];

type DbDiagnostics = {
  status:
    | "ok"
    | "missing-config"
    | "pool-unavailable"
    | "connection-failed"
    | "schema-mismatch";
  hasDatabaseUrl: boolean;
  canConnect: boolean;
  missingTables: string[];
  details: string;
  pingMs?: number;
  errorCode?: string;
};

const DEFAULT_DATA_INIT_TIMEOUT_MS = 6000;

function getDefaultDataInitTimeoutMs() {
  const parsed = Number.parseInt(
    process.env.DEFAULT_DATA_INIT_TIMEOUT_MS || `${DEFAULT_DATA_INIT_TIMEOUT_MS}`,
    10,
  );

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_DATA_INIT_TIMEOUT_MS;
  }

  return parsed;
}

async function initializeDefaultsWithoutBlockingStartup() {
  const timeoutMs = getDefaultDataInitTimeoutMs();

  try {
    await Promise.race([
      storage.initializeDefaultData(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error(`initializeDefaultData timed out after ${timeoutMs}ms`);
          (timeoutError as Error & { code?: string }).code = "DEFAULT_INIT_TIMEOUT";
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
    console.log("[startup] Default data initialization finished");
  } catch (error: any) {
    console.error("[startup] Failed to initialize default data", {
      message: error?.message,
      code: error?.code,
    });
  }
}

async function getDbDiagnostics(): Promise<DbDiagnostics> {
  if (!hasDatabaseUrl) {
    return {
      status: "missing-config",
      hasDatabaseUrl: false,
      canConnect: false,
      missingTables: [...REQUIRED_PUBLIC_TABLES],
      details: "DATABASE_URL is not set",
    };
  }

  if (!pool) {
    return {
      status: "pool-unavailable",
      hasDatabaseUrl: true,
      canConnect: false,
      missingTables: [...REQUIRED_PUBLIC_TABLES],
      details: "Database pool failed to initialize",
    };
  }

  const startedAt = Date.now();

  try {
    await pool.query("select 1 as ok");

    const tableResult = await pool.query<{ table_name: string }>(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])
      `,
      [REQUIRED_PUBLIC_TABLES],
    );

    const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_PUBLIC_TABLES.filter((table) => !existingTables.has(table));

    return {
      status: missingTables.length === 0 ? "ok" : "schema-mismatch",
      hasDatabaseUrl: true,
      canConnect: true,
      missingTables,
      details:
        missingTables.length === 0
          ? "Database connection and required tables are healthy"
          : `Missing required public tables: ${missingTables.join(", ")}`,
      pingMs: Date.now() - startedAt,
    };
  } catch (error: any) {
    return {
      status: "connection-failed",
      hasDatabaseUrl: true,
      canConnect: false,
      missingTables: [...REQUIRED_PUBLIC_TABLES],
      details: error?.message || "Failed to connect to the database",
      errorCode: typeof error?.code === "string" ? error.code : undefined,
      pingMs: Date.now() - startedAt,
    };
  }
}

function normalizeDriveUrl(url: string): string {
  if (!url || !url.includes("drive.google.com")) return url;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const normalized = `https://drive.google.com/uc?export=view&id=${match[1]}`;
      console.log("[image] normalized drive url", {
        originalUrl: url,
        normalizedUrl: normalized,
      });
      return normalized;
    }
  }
  console.error("[image] failed to normalize drive url", { url });
  return url;
}

const imageProxyAllowedHosts = new Set([
  "ibb.co",
  "www.ibb.co",
  "imgbb.com",
  "www.imgbb.com",
  "i.ibb.co",
]);

function extractOgImageFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function resolveImageProxyTarget(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();

  if (host === "ibb.co" || host === "www.ibb.co" || host === "imgbb.com" || host === "www.imgbb.com") {
    const pageResponse = await fetch(rawUrl, { redirect: "follow" });
    if (!pageResponse.ok) {
      throw new Error(`Image page request failed with status ${pageResponse.status}`);
    }

    const pageHtml = await pageResponse.text();
    const ogImage = extractOgImageFromHtml(pageHtml);
    if (!ogImage) {
      throw new Error("Could not find og:image on the image page");
    }

    return ogImage;
  }

  return rawUrl;
}

const CHAPTER_LOGO_BUCKET = process.env.SUPABASE_CHAPTER_LOGO_BUCKET || "chapter-logos";
const CHAPTER_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const CHAPTER_LOGO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

let supabaseStorageClient: ReturnType<typeof createClient> | null = null;
let chapterLogoBucketEnsured = false;

function getSupabaseStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!supabaseStorageClient) {
    supabaseStorageClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseStorageClient;
}

function isStorageAlreadyExistsError(error: { message?: string } | null) {
  const normalizedMessage = error?.message?.toLowerCase() || "";
  return normalizedMessage.includes("already exists") || normalizedMessage.includes("duplicate");
}

async function ensureChapterLogoBucket(client: ReturnType<typeof createClient>) {
  if (chapterLogoBucketEnsured) {
    return;
  }

  const bucketOptions = {
    public: true,
    fileSizeLimit: CHAPTER_LOGO_MAX_BYTES,
    allowedMimeTypes: Array.from(CHAPTER_LOGO_ALLOWED_MIME_TYPES),
  };

  const { error: createBucketError } = await client.storage.createBucket(CHAPTER_LOGO_BUCKET, bucketOptions);
  if (createBucketError && !isStorageAlreadyExistsError(createBucketError)) {
    throw createBucketError;
  }

  if (createBucketError && isStorageAlreadyExistsError(createBucketError)) {
    const { data: existingBucket, error: getBucketError } = await client.storage.getBucket(CHAPTER_LOGO_BUCKET);
    if (getBucketError) {
      throw getBucketError;
    }

    if (existingBucket && !existingBucket.public) {
      const { error: updateBucketError } = await client.storage.updateBucket(CHAPTER_LOGO_BUCKET, bucketOptions);
      if (updateBucketError) {
        throw updateBucketError;
      }
    }
  }

  chapterLogoBucketEnsured = true;
}

function sanitizePathSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "chapter"
  );
}

function resolveImageExtension(originalName: string, mimeType: string) {
  const extension = path.extname(originalName).toLowerCase();
  if (extension) {
    return extension;
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/gif") {
    return ".gif";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return ".jpg";
}

function getStoragePathFromPublicUrl(url: string, bucketName: string) {
  try {
    const parsedUrl = new URL(url);
    const publicPathPrefix = `/storage/v1/object/public/${bucketName}/`;
    const pathStartIndex = parsedUrl.pathname.indexOf(publicPathPrefix);

    if (pathStartIndex < 0) {
      return null;
    }

    return decodeURIComponent(parsedUrl.pathname.slice(pathStartIndex + publicPathPrefix.length));
  } catch {
    return null;
  }
}

function getUploadsPathFromPublicUrl(url: string) {
  const normalized = (url || "").trim();
  if (!normalized.startsWith("/uploads/")) {
    return null;
  }

  return normalized.replace(/^\/uploads\//, "");
}

const chapterLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAPTER_LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const normalizedMimeType = (file.mimetype || "").toLowerCase();
    if (CHAPTER_LOGO_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
      cb(null, true);
      return;
    }

    cb(new Error("Only JPG, PNG, GIF, and WEBP images are allowed for chapter logos"));
  },
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = ensureUploadsDir();
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log("[image-upload] accepted file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      return cb(null, true);
    } else {
      console.error("[image-upload] rejected file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      cb(new Error("Only image files are allowed"));
    }
  },
});

const volunteerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = ensureUploadsDir();
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "volunteer-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log("[volunteer-image-upload] accepted file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      return cb(null, true);
    } else {
      console.error("[volunteer-image-upload] rejected file", {
        route: req.originalUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      cb(new Error("Only jpg, png, or webp images under 2MB are allowed"));
    }
  },
});

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "admin" | "chapter" | "barangay";
    chapterId?: string;
    barangayId?: string;
    barangayName?: string;
  }
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function requireAdminAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.status(401).json({ error: "Admin access required" });
  }
  next();
}

function requireChapterAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "chapter") {
    return res.status(401).json({ error: "Chapter access required" });
  }
  next();
}

function requireBarangayAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || req.session.role !== "barangay") {
    return res.status(401).json({ error: "Barangay access required" });
  }
  next();
}

function requireChapterOrBarangayAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId || (req.session.role !== "chapter" && req.session.role !== "barangay")) {
    return res.status(401).json({ error: "Chapter or Barangay access required" });
  }
  next();
}

async function getChapterBarangayIdSet(chapterId: string): Promise<Set<string>> {
  const chapterBarangays = await storage.getBarangayUsersByChapterId(chapterId);
  return new Set(chapterBarangays.map((barangay) => barangay.id));
}

async function getScopedBarangayUser(req: Request, barangayUserId: string) {
  const barangayUser = await storage.getBarangayUser(barangayUserId);
  if (!barangayUser) {
    return { status: 404 as const, barangayUser: null };
  }

  if (req.session.role === "admin") {
    return { status: 200 as const, barangayUser };
  }

  if (
    req.session.role === "chapter" &&
    req.session.chapterId &&
    barangayUser.chapterId === req.session.chapterId
  ) {
    return { status: 200 as const, barangayUser };
  }

  return { status: 403 as const, barangayUser: null };
}

async function getChapterManageableKpiTemplateContext(templateId: string, chapterId: string) {
  const template = await storage.getKpiTemplate(templateId);
  if (!template || template.scope !== "selected_barangays") {
    return null;
  }

  const scopes = await storage.getKpiScopesByTemplateId(templateId);
  const barangayIds = Array.from(
    new Set(
      scopes
        .filter((scope) => scope.entityType === "barangay")
        .map((scope) => scope.entityId),
    ),
  );

  if (barangayIds.length === 0) {
    return null;
  }

  const chapterBarangayIds = await getChapterBarangayIdSet(chapterId);
  if (barangayIds.some((barangayId) => !chapterBarangayIds.has(barangayId))) {
    return null;
  }

  return {
    template,
    scopes,
    barangayIds,
  };
}

function isBarangayOnlyKpiTemplateScope(template: { scope: string | null | undefined }) {
  return template.scope === "selected_barangays";
}

function isBarangayRecipientKpiScope(scope: string | null | undefined) {
  return (
    scope === "all_chapters_and_barangays" ||
    scope === "all_barangays" ||
    scope === "selected_barangays" ||
    scope === "selected_chapters"
  );
}

async function isTemplateAssignedToBarangay(templateId: string, chapterId: string, barangayId: string) {
  const template = await storage.getKpiTemplate(templateId);
  if (!template || !isBarangayRecipientKpiScope(template.scope)) {
    return false;
  }

  if (template.scope === "selected_barangays") {
    const scopes = await storage.getKpiScopesByTemplateId(templateId);
    return scopes.some((scope) => scope.entityType === "barangay" && scope.entityId === barangayId);
  }

  if (template.scope === "selected_chapters") {
    const scopes = await storage.getKpiScopesByTemplateId(templateId);
    return scopes.some((scope) => scope.entityType === "chapter" && scope.entityId === chapterId);
  }

  return true;
}

type SyncBarangayAutoDependencyOptions = {
  chapterId: string;
  barangayId: string;
  year?: number;
  quarter?: number;
};

type BarangayAutoDependencyEvaluation = {
  isCompleted: boolean;
  numericValue: number | null;
  textValue: string;
};

function hasKpiCompletionPayloadChanges(
  existingCompletion: {
    isCompleted: boolean;
    numericValue: number | null;
    textValue: string | null;
    completedAt: Date | null;
  },
  payload: {
    isCompleted: boolean;
    numericValue: number | null;
    textValue: string;
    completedAt: Date | null;
  },
) {
  const existingCompletedAtMs = existingCompletion.completedAt ? new Date(existingCompletion.completedAt).getTime() : null;
  const payloadCompletedAtMs = payload.completedAt ? payload.completedAt.getTime() : null;

  return (
    existingCompletion.isCompleted !== payload.isCompleted ||
    (existingCompletion.numericValue ?? null) !== payload.numericValue ||
    (existingCompletion.textValue ?? null) !== payload.textValue ||
    existingCompletedAtMs !== payloadCompletedAtMs
  );
}

async function evaluateAutoDependencyForBarangayTemplate(
  chapterId: string,
  barangayId: string,
  config: NonNullable<ReturnType<typeof parseKpiDependencyConfig>>,
  chapterMetricCache: Map<KpiDependencyMetric, number>,
): Promise<BarangayAutoDependencyEvaluation> {
  const ruleOutcomes: Array<{ value: number; passed: boolean; ruleLine: string }> = [];

  for (const rule of config.rules) {
    const value = await resolveDependencyMetricByBarangay(rule.metric, chapterId, barangayId, chapterMetricCache);
    const passed = evaluateKpiDependencyRule(value, rule.operator, rule.targetValue);
    ruleOutcomes.push({
      value,
      passed,
      ruleLine: formatKpiDependencyRuleDescription(rule.metric, rule.operator, rule.targetValue),
    });
  }

  const isCompleted =
    config.aggregation === "any"
      ? ruleOutcomes.some((outcome) => outcome.passed)
      : ruleOutcomes.every((outcome) => outcome.passed);

  const numericValue = ruleOutcomes[0]?.value ?? null;
  const ruleSummaryLines = ruleOutcomes.map((outcome) => `${outcome.passed ? "PASS" : "PENDING"} - ${outcome.ruleLine}`);

  return {
    isCompleted,
    numericValue,
    textValue: `${summarizeKpiDependencyConfig(config)} || ${ruleSummaryLines.join(" || ")}`,
  };
}

async function syncAutoDependencyKpiCompletionsForBarangay(
  options: SyncBarangayAutoDependencyOptions,
) {
  const templates = await storage.getKpiTemplatesForBarangay(
    options.year,
    options.barangayId,
    options.chapterId,
    options.quarter,
  );

  const recipientTemplateIds = new Set(templates.map((template) => template.id));

  const existingCompletions = await storage.getBarangayKpiCompletions(options.barangayId, options.year, options.quarter);

  for (const completion of existingCompletions) {
    if (!recipientTemplateIds.has(completion.kpiTemplateId)) {
      await storage.deleteKpiCompletion(completion.id);
    }
  }

  const autoTemplates = templates
    .map((template) => ({ template, config: parseKpiDependencyConfig(template.linkedEntityId) }))
    .filter(
      (
        item,
      ): item is {
        template: (typeof templates)[number];
        config: NonNullable<ReturnType<typeof parseKpiDependencyConfig>>;
      } => Boolean(item.config),
    );

  if (autoTemplates.length === 0) {
    return;
  }

  const refreshedCompletions = await storage.getBarangayKpiCompletions(options.barangayId, options.year, options.quarter);
  const existingByTemplateId = new Map(refreshedCompletions.map((completion) => [completion.kpiTemplateId, completion]));
  const chapterMetricCache = new Map<KpiDependencyMetric, number>();

  for (const { template, config } of autoTemplates) {
    const evaluation = await evaluateAutoDependencyForBarangayTemplate(
      options.chapterId,
      options.barangayId,
      config,
      chapterMetricCache,
    );
    const existingCompletion = existingByTemplateId.get(template.id);

    if (!existingCompletion) {
      await storage.createKpiCompletion({
        chapterId: options.chapterId,
        barangayId: options.barangayId,
        kpiTemplateId: template.id,
        numericValue: evaluation.numericValue,
        textValue: evaluation.textValue,
        isCompleted: evaluation.isCompleted,
        completedAt: evaluation.isCompleted ? new Date() : null,
      });
      continue;
    }

    const completedAt = evaluation.isCompleted
      ? existingCompletion.completedAt ?? new Date()
      : null;

    const updatePayload = {
      isCompleted: evaluation.isCompleted,
      numericValue: evaluation.numericValue,
      textValue: evaluation.textValue,
      completedAt,
    };

    if (hasKpiCompletionPayloadChanges(existingCompletion, updatePayload)) {
      await storage.updateKpiCompletion(existingCompletion.id, updatePayload);
    }
  }
}

async function resolveDependencyMetricByBarangay(
  metric: KpiDependencyMetric,
  chapterId: string,
  barangayId: string,
  chapterMetricCache: Map<KpiDependencyMetric, number>,
) {
  if (
    metric === "project_reports_count" ||
    metric === "documents_acknowledged_count" ||
    metric === "volunteer_opportunities_count" ||
    metric === "mou_submissions_count" ||
    metric === "chapter_requests_count" ||
    metric === "publications_count"
  ) {
    const cached = chapterMetricCache.get(metric);
    if (cached !== undefined) {
      return cached;
    }

    let chapterMetricValue = 0;
    if (metric === "project_reports_count") {
      const reports = await storage.getProjectReportsByChapter(chapterId);
      chapterMetricValue = reports.length;
    } else if (metric === "documents_acknowledged_count") {
      const acknowledgements = await storage.getChapterDocumentAcks(chapterId);
      chapterMetricValue = acknowledgements.filter((ack) => ack.acknowledged).length;
    } else if (metric === "volunteer_opportunities_count") {
      const opportunities = await storage.getVolunteerOpportunitiesByChapter(chapterId);
      chapterMetricValue = opportunities.length;
    } else if (metric === "mou_submissions_count") {
      const submission = await storage.getMouSubmissionByChapter(chapterId);
      chapterMetricValue = submission ? 1 : 0;
    } else if (metric === "chapter_requests_count") {
      const requests = await storage.getChapterRequestsByChapter(chapterId);
      chapterMetricValue = requests.length;
    } else if (metric === "publications_count") {
      const publications = await storage.getPublicationsByChapter(chapterId);
      chapterMetricValue = publications.length;
    }

    chapterMetricCache.set(metric, chapterMetricValue);
    return chapterMetricValue;
  }

  if (metric === "members_directory_count") {
    const members = await storage.getMembersByBarangay(barangayId);
    return members.filter((member) => member.isActive).length;
  }

  if (metric === "officers_count") {
    const officers = await storage.getOfficersByBarangay(barangayId);
    return officers.length;
  }

  if (metric === "national_messages_count") {
    const messages = await storage.getNationalRequestsBySender("barangay", barangayId);
    return messages.length;
  }

  if (metric === "active_barangay_accounts_count") {
    const barangayUser = await storage.getBarangayUser(barangayId);
    return barangayUser?.isActive ? 1 : 0;
  }

  return 0;
}

function isUsernameTakenByDifferentUser(
  username: string,
  currentRole: "admin" | "chapter" | "barangay",
  currentUserId: string,
  existingUsers: {
    admin?: { id: string };
    chapter?: { id: string };
    barangay?: { id: string };
  },
) {
  const { admin, chapter, barangay } = existingUsers;

  if (admin && (currentRole !== "admin" || admin.id !== currentUserId)) {
    return true;
  }

  if (chapter && (currentRole !== "chapter" || chapter.id !== currentUserId)) {
    return true;
  }

  if (barangay && (currentRole !== "barangay" || barangay.id !== currentUserId)) {
    return true;
  }

  return false;
}

const ADMIN_RELATIONSHIP_TABLE = "admin_user_relationships";
let adminRelationshipTableEnsured = false;

const adminAccountCreateSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const adminAccountUpdateSchema = z
  .object({
    username: z.string().trim().min(3, "Username must be at least 3 characters").optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((value) => value.username !== undefined || value.password !== undefined, {
    message: "At least one field is required",
  });

async function ensureAdminRelationshipTable() {
  if (adminRelationshipTableEnsured || !pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${ADMIN_RELATIONSHIP_TABLE} (
      admin_user_id varchar PRIMARY KEY,
      created_by_admin_id varchar NULL,
      created_at timestamp without time zone DEFAULT now() NOT NULL
    )
  `);

  adminRelationshipTableEnsured = true;
}

async function getAdminCreatorId(adminUserId: string): Promise<string | null> {
  if (!pool) {
    return null;
  }

  await ensureAdminRelationshipTable();
  const result = await pool.query<{ created_by_admin_id: string | null }>(
    `
      SELECT created_by_admin_id
      FROM ${ADMIN_RELATIONSHIP_TABLE}
      WHERE admin_user_id = $1
      LIMIT 1
    `,
    [adminUserId],
  );

  return result.rows[0]?.created_by_admin_id ?? null;
}

async function getAdminCreatorMap(adminUserIds: string[]): Promise<Map<string, string | null>> {
  const creatorMap = new Map<string, string | null>();
  if (!pool || adminUserIds.length === 0) {
    return creatorMap;
  }

  await ensureAdminRelationshipTable();
  const result = await pool.query<{ admin_user_id: string; created_by_admin_id: string | null }>(
    `
      SELECT admin_user_id, created_by_admin_id
      FROM ${ADMIN_RELATIONSHIP_TABLE}
      WHERE admin_user_id = ANY($1::text[])
    `,
    [adminUserIds],
  );

  for (const row of result.rows) {
    creatorMap.set(row.admin_user_id, row.created_by_admin_id);
  }

  return creatorMap;
}

async function setAdminCreator(adminUserId: string, createdByAdminId: string | null) {
  if (!pool) {
    return;
  }

  await ensureAdminRelationshipTable();
  await pool.query(
    `
      INSERT INTO ${ADMIN_RELATIONSHIP_TABLE} (admin_user_id, created_by_admin_id)
      VALUES ($1, $2)
      ON CONFLICT (admin_user_id)
      DO UPDATE SET created_by_admin_id = EXCLUDED.created_by_admin_id
    `,
    [adminUserId, createdByAdminId],
  );
}

async function cleanupDeletedAdminCreatorLinks(adminUserId: string) {
  if (!pool) {
    return;
  }

  await ensureAdminRelationshipTable();
  await pool.query(`DELETE FROM ${ADMIN_RELATIONSHIP_TABLE} WHERE admin_user_id = $1`, [adminUserId]);
  await pool.query(
    `UPDATE ${ADMIN_RELATIONSHIP_TABLE} SET created_by_admin_id = NULL WHERE created_by_admin_id = $1`,
    [adminUserId],
  );
}

const APPLICATION_REFERENCE_REGEX = /^YSPAP-[A-Z0-9]{4}-\d{4}$/;
const MEMBER_APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let memberApplicationReferenceInfraEnsured = false;
let memberApplicationReferenceBackfillCompleted = false;
let memberApplicationReferenceBackfillPromise: Promise<void> | null = null;
let kpiCompletionBarangayInfraEnsured = false;
let volunteerOpportunityInfraEnsured = false;

function normalizeApplicationReferenceId(value: string) {
  return value.trim().toUpperCase();
}

function buildApplicationReferenceId(year: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    code += alphabet[randomIndex];
  }

  return `YSPAP-${code}-${year}`;
}

async function ensureMembersApplicationReferenceInfra() {
  if (memberApplicationReferenceInfraEnsured || !pool) {
    return;
  }

  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS application_reference_id text`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS application_status text`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS email text`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url text`);
  await pool.query(`
    UPDATE members
    SET application_status = CASE
      WHEN is_active THEN 'approved'
      ELSE 'pending'
    END
    WHERE application_status IS NULL
      OR application_status NOT IN ('pending', 'approved', 'rejected')
  `);
  await pool.query(`ALTER TABLE members ALTER COLUMN application_status SET DEFAULT 'pending'`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS members_application_reference_id_unique
    ON members (application_reference_id)
    WHERE application_reference_id IS NOT NULL
  `);

  memberApplicationReferenceInfraEnsured = true;
}

async function ensureKpiCompletionBarangayInfra() {
  if (kpiCompletionBarangayInfraEnsured || !pool) {
    return;
  }

  await pool.query(`ALTER TABLE kpi_completions ADD COLUMN IF NOT EXISTS barangay_id varchar`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'kpi_completions_barangay_id_fkey'
      ) THEN
        ALTER TABLE kpi_completions
          ADD CONSTRAINT kpi_completions_barangay_id_fkey
          FOREIGN KEY (barangay_id)
          REFERENCES barangay_users(id)
          ON DELETE SET NULL;
      END IF;
    END
    $$
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS kpi_completions_barangay_id_idx
    ON kpi_completions (barangay_id)
  `);

  kpiCompletionBarangayInfraEnsured = true;
}

async function ensureVolunteerOpportunityInfra() {
  if (volunteerOpportunityInfraEnsured || !pool) {
    return;
  }

  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS barangay_id varchar`);
  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS barangay_ids text`);
  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS description text`);
  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS learn_more_url text`);
  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS apply_url text`);
  await pool.query(`ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS deadline_at timestamp`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'volunteer_opportunities_barangay_id_fkey'
      ) THEN
        ALTER TABLE volunteer_opportunities
          ADD CONSTRAINT volunteer_opportunities_barangay_id_fkey
          FOREIGN KEY (barangay_id)
          REFERENCES barangay_users(id)
          ON DELETE SET NULL;
      END IF;
    END
    $$
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS volunteer_opportunities_chapter_id_idx
    ON volunteer_opportunities (chapter_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS volunteer_opportunities_barangay_id_idx
    ON volunteer_opportunities (barangay_id)
  `);

  volunteerOpportunityInfraEnsured = true;
}

async function ensureBackfilledMemberApplicationReferenceIds() {
  if (!pool || memberApplicationReferenceBackfillCompleted) {
    return;
  }

  if (memberApplicationReferenceBackfillPromise) {
    await memberApplicationReferenceBackfillPromise;
    return;
  }

  memberApplicationReferenceBackfillPromise = (async () => {
    await ensureMembersApplicationReferenceInfra();

    const existingReferencesResult = await pool.query<{ application_reference_id: string }>(
      `
      SELECT application_reference_id
      FROM members
      WHERE application_reference_id IS NOT NULL
        AND TRIM(application_reference_id) <> ''
      `,
    );

    const usedReferences = new Set(
      existingReferencesResult.rows.map((row) => normalizeApplicationReferenceId(row.application_reference_id)),
    );

    const membersMissingReferenceResult = await pool.query<{ id: string; created_at: Date | string | null }>(
      `
      SELECT id, created_at
      FROM members
      WHERE application_reference_id IS NULL
         OR TRIM(application_reference_id) = ''
      ORDER BY created_at ASC NULLS LAST, id ASC
      `,
    );

    for (const row of membersMissingReferenceResult.rows) {
      const parsedCreatedAt = row.created_at ? new Date(row.created_at) : null;
      const fallbackYear = new Date().getFullYear();
      const referenceYear =
        parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
          ? parsedCreatedAt.getFullYear()
          : fallbackYear;

      let referenceId = "";
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const candidate = buildApplicationReferenceId(referenceYear);
        if (!usedReferences.has(candidate)) {
          referenceId = candidate;
          break;
        }
      }

      if (!referenceId) {
        throw new Error(`Failed to backfill application reference ID for member ${row.id}`);
      }

      await pool.query(
        `
        UPDATE members
        SET application_reference_id = $1
        WHERE id = $2
          AND (application_reference_id IS NULL OR TRIM(application_reference_id) = '')
        `,
        [referenceId, row.id],
      );

      usedReferences.add(referenceId);
    }

    memberApplicationReferenceBackfillCompleted = true;
  })();

  try {
    await memberApplicationReferenceBackfillPromise;
  } finally {
    memberApplicationReferenceBackfillPromise = null;
  }
}

async function generateUniqueMemberApplicationReferenceId() {
  await ensureMembersApplicationReferenceInfra();

  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = buildApplicationReferenceId(year);
    const existing = await storage.getMemberByApplicationReferenceId(candidate);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Failed to generate a unique application reference ID");
}

const PUBLIC_SITE_PATHS = [
  "/",
  "/programs",
  "/publications",
  "/membership",
  "/volunteer",
  "/contact",
];

function normalizePublicSiteOrigin(rawUrl?: string) {
  if (!rawUrl || !rawUrl.trim()) {
    return "https://youthserviceph.org";
  }

  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    console.warn(`[startup] Invalid PUBLIC_SITE_URL \"${rawUrl}\". Falling back to https://youthserviceph.org`);
    return "https://youthserviceph.org";
  }
}

const NATIONAL_SITE_ORIGIN = normalizePublicSiteOrigin(process.env.PUBLIC_SITE_URL);
const NATIONAL_SITE_HOSTNAME = new URL(NATIONAL_SITE_ORIGIN).hostname.toLowerCase();
const INDEXABLE_HOSTS = new Set([
  NATIONAL_SITE_HOSTNAME,
  `www.${NATIONAL_SITE_HOSTNAME}`,
  "localhost",
  "127.0.0.1",
]);

function getRequestHostname(req: Request) {
  return (req.get("host") || "").split(":")[0].toLowerCase();
}

function shouldAllowIndexing(req: Request) {
  return INDEXABLE_HOSTS.has(getRequestHostname(req));
}

function isPdfFallbackMetadataScopeAllowed(
  req: Request,
  metadata: { chapterId?: string; barangayId?: string },
) {
  const sessionRole = req.session.role;

  if (sessionRole === "admin") {
    return true;
  }

  if (sessionRole === "chapter") {
    if (!req.session.chapterId) {
      return false;
    }

    return !metadata.chapterId || metadata.chapterId === req.session.chapterId;
  }

  if (sessionRole === "barangay") {
    const contractChapterId = metadata.chapterId;
    const contractBarangayId = metadata.barangayId;

    if (contractChapterId && req.session.chapterId && contractChapterId !== req.session.chapterId) {
      return false;
    }

    if (contractBarangayId && req.session.barangayId && contractBarangayId !== req.session.barangayId) {
      return false;
    }

    return true;
  }

  return false;
}

function isPdfFallbackScopeAllowed(req: Request, contract: PdfExportContract) {
  return isPdfFallbackMetadataScopeAllowed(req, {
    chapterId: contract.snapshotMetadata.chapterId,
    barangayId: contract.snapshotMetadata.barangayId,
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  if (process.env.DATABASE_URL) {
    try {
      await ensureKpiCompletionBarangayInfra();
      await ensureVolunteerOpportunityInfra();
    } catch (error: any) {
      console.error("[startup] Failed to ensure startup schema infra", {
        message: error?.message,
      });
    }
  }

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api") && !shouldAllowIndexing(req)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  app.get("/robots.txt", (req, res) => {
    const origin = NATIONAL_SITE_ORIGIN;

    if (!shouldAllowIndexing(req)) {
      const robots = [
        "User-agent: *",
        "Disallow: /",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
      ].join("\n");

      return res
        .type("text/plain")
        .set("Cache-Control", "public, max-age=3600")
        .send(robots);
    }

    const robots = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /chapter-dashboard",
      "Disallow: /barangay-dashboard",
      "Disallow: /my-profile",
      "Disallow: /login",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n");

    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(robots);
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = NATIONAL_SITE_ORIGIN;
    const lastModified = new Date().toISOString();
    const urlEntries = PUBLIC_SITE_PATHS.map((sitePath) => {
      const loc = `${origin}${sitePath}`;
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n");
    }).join("\n");

    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntries,
      "</urlset>",
      "",
    ].join("\n");

    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(sitemap);
  });

  app.get("/api/image-proxy", async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
      if (!rawUrl) {
        return res.status(400).json({ error: "url query parameter is required" });
      }

      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).json({ error: "Only http/https URLs are supported" });
      }

      const host = parsed.hostname.toLowerCase();
      if (!imageProxyAllowedHosts.has(host)) {
        return res.status(403).json({ error: "Host is not allowed for image proxy" });
      }

      const resolvedUrl = await resolveImageProxyTarget(rawUrl);
      console.log("[image-proxy] resolved", { rawUrl, resolvedUrl });

      const imageResponse = await fetch(resolvedUrl, { redirect: "follow" });
      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
      }

      const contentType = imageResponse.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        console.error("[image-proxy] resolved URL did not return an image", {
          rawUrl,
          resolvedUrl,
          contentType,
        });
        return res.status(502).json({ error: "Resolved URL did not return an image" });
      }

      const cacheHeader = imageResponse.headers.get("cache-control") || "public, max-age=3600";
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", cacheHeader);
      res.send(imageBuffer);
    } catch (error: any) {
      console.error("[image-proxy] request failed", {
        url: req.query.url,
        message: error?.message,
      });
      res.status(502).json({ error: "Failed to resolve image URL" });
    }
  });

  app.get("/api/health", async (_req, res) => {
    const db = await getDbDiagnostics();
    const healthy = db.status === "ok";

    res.status(healthy ? 200 : 503).json({
      healthy,
      service: "api",
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: db.status,
          hasDatabaseUrl: db.hasDatabaseUrl,
          canConnect: db.canConnect,
          missingTables: db.missingTables,
          details: db.details,
          pingMs: db.pingMs,
          errorCode: db.errorCode,
        },
      },
    });
  });

  app.get("/api/health/debug", async (_req, res) => {
    const db = await getDbDiagnostics();
    const healthy = db.status === "ok";

    res.status(healthy ? 200 : 503).json({
      healthy,
      service: "api",
      timestamp: new Date().toISOString(),
      runtime: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        vercelEnv: process.env.VERCEL_ENV || "not-vercel",
        region: process.env.VERCEL_REGION || "unknown",
      },
      checks: {
        database: {
          status: db.status,
          hasDatabaseUrl: db.hasDatabaseUrl,
          canConnect: db.canConnect,
          requiredTables: REQUIRED_PUBLIC_TABLES,
          missingTables: db.missingTables,
          details: db.details,
          pingMs: db.pingMs,
          errorCode: db.errorCode,
        },
      },
    });
  });

  app.post("/api/pdf-exports/fallback", requireAuth, async (req, res) => {
    const rawContract = req.body?.contract ?? req.body;
    const reasonText =
      typeof req.body?.reason === "string" && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 600)
        : "client-export-failed";

    try {
      const contract = parsePdfExportContract(rawContract);

      if (!isPdfFallbackScopeAllowed(req, contract)) {
        registerRejectedPdfFallback({
          reportId: contract.reportId,
          purpose: contract.purpose,
          actorRole: req.session.role || "unknown",
          chapterId: contract.snapshotMetadata.chapterId,
          barangayId: contract.snapshotMetadata.barangayId,
          source: contract.snapshotMetadata.source,
          generationMode: contract.generationMode,
          reason: "scope-mismatch",
          requestIp: req.ip || "unknown",
          userAgent: req.get("user-agent") || "unknown",
        });
        return res.status(403).json({ error: "Fallback scope does not match your current session" });
      }

      const acceptedEntry = registerAcceptedPdfFallback({
        contract,
        actorRole: req.session.role || contract.snapshotMetadata.actorRole || "unknown",
        reason: reasonText,
        requestIp: req.ip || "unknown",
        userAgent: req.get("user-agent") || "unknown",
      });

      console.warn("[pdf-fallback] request accepted", {
        id: acceptedEntry.id,
        reportId: acceptedEntry.reportId,
        actorRole: acceptedEntry.actorRole,
        chapterId: acceptedEntry.chapterId,
      });

      return res.status(202).json({
        accepted: true,
        fallbackId: acceptedEntry.id,
        status: acceptedEntry.status,
        mode: "server-fallback-renderer",
        statusUrl: `/api/pdf-exports/fallback/${acceptedEntry.id}`,
        downloadUrl: `/api/pdf-exports/fallback/${acceptedEntry.id}/download`,
        message: "Fallback intake accepted. Server-side rendering has been queued.",
      });
    } catch (error: any) {
      const validationError = fromError(error);
      const reportId = typeof rawContract?.reportId === "string" ? rawContract.reportId : "unknown";
      const purpose = typeof rawContract?.purpose === "string" ? rawContract.purpose : "unknown";

      registerRejectedPdfFallback({
        reportId,
        purpose,
        actorRole: req.session.role || "unknown",
        chapterId: typeof rawContract?.snapshotMetadata?.chapterId === "string" ? rawContract.snapshotMetadata.chapterId : undefined,
        barangayId: typeof rawContract?.snapshotMetadata?.barangayId === "string" ? rawContract.snapshotMetadata.barangayId : undefined,
        source: rawContract?.snapshotMetadata?.source === "api" ? "api" : "ui",
        generationMode:
          rawContract?.generationMode === "server" || rawContract?.generationMode === "hybrid"
            ? rawContract.generationMode
            : "client",
        reason: `validation-error: ${validationError.message}`,
        requestIp: req.ip || "unknown",
        userAgent: req.get("user-agent") || "unknown",
      });

      return res.status(400).json({
        error: "Invalid PDF export contract payload",
        details: validationError.message,
      });
    }
  });

  app.get("/api/pdf-exports/fallback/audit", requireAdminAuth, async (_req, res) => {
    return res.json({
      entries: [...listPdfFallbackAuditEntries()].reverse(),
    });
  });

  app.get("/api/pdf-exports/fallback/:fallbackId", requireAuth, async (req, res) => {
    const fallbackId = req.params.fallbackId;
    const internalEntry = getPdfFallbackInternalEntryById(fallbackId);

    if (!internalEntry) {
      return res.status(404).json({ error: "Fallback request not found" });
    }

    if (
      !isPdfFallbackMetadataScopeAllowed(req, {
        chapterId: internalEntry.chapterId,
        barangayId: internalEntry.barangayId,
      })
    ) {
      return res.status(403).json({ error: "You do not have access to this fallback request" });
    }

    const entry = getPdfFallbackAuditEntryById(fallbackId);
    if (!entry) {
      return res.status(404).json({ error: "Fallback request not found" });
    }

    return res.json({
      entry,
      downloadUrl: entry.status === "completed" ? `/api/pdf-exports/fallback/${fallbackId}/download` : null,
    });
  });

  app.get("/api/pdf-exports/fallback/:fallbackId/download", requireAuth, async (req, res) => {
    const fallbackId = req.params.fallbackId;
    const internalEntry = getPdfFallbackInternalEntryById(fallbackId);

    if (!internalEntry) {
      return res.status(404).json({ error: "Fallback request not found" });
    }

    if (
      !isPdfFallbackMetadataScopeAllowed(req, {
        chapterId: internalEntry.chapterId,
        barangayId: internalEntry.barangayId,
      })
    ) {
      return res.status(403).json({ error: "You do not have access to this fallback file" });
    }

    if (internalEntry.status !== "completed" || !internalEntry.outputAbsolutePath || !internalEntry.outputFileName) {
      return res.status(409).json({
        error: "Fallback PDF is not ready",
        status: internalEntry.status,
        details: internalEntry.errorMessage || null,
      });
    }

    if (!fs.existsSync(internalEntry.outputAbsolutePath)) {
      return res.status(404).json({ error: "Fallback file is no longer available" });
    }

    return res.download(internalEntry.outputAbsolutePath, internalEntry.outputFileName);
  });
  
  app.post("/api/auth/login/admin", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await storage.getAdminUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.role = "admin";
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ success: true, user: { id: user.id, username: user.username, role: "admin" } });
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();

    const admin = await storage.getAdminUserByUsername(normalizedUsername);
    if (admin) {
      const adminPasswordMatch = await bcrypt.compare(password, admin.password);
      if (adminPasswordMatch) {
        req.session.userId = admin.id;
        req.session.role = "admin";
        req.session.chapterId = undefined;
        req.session.barangayId = undefined;
        req.session.barangayName = undefined;

        return req.session.save((err) => {
          if (err) {
            console.error("[Auth] Session save error:", err);
            return res.status(500).json({ error: "Failed to save session" });
          }
          res.json({ success: true, user: { id: admin.id, username: admin.username, role: "admin" } });
        });
      }
    }

    const chapterUser = await storage.getChapterUserByUsername(normalizedUsername);
    if (chapterUser) {
      if (!chapterUser.isActive) {
        return res.status(401).json({ error: "Account is disabled" });
      }

      if (chapterUser.lockedUntil && new Date(chapterUser.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(chapterUser.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
      }

      const chapterPasswordMatch = await bcrypt.compare(password, chapterUser.password);
      if (!chapterPasswordMatch) {
        const attempts = (chapterUser.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        if (attempts >= 3) {
          updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
          console.log("[Auth] Chapter account locked due to 3 failed attempts:", chapterUser.username);
        }
        await storage.updateChapterUser(chapterUser.id, updateData);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateChapterUser(chapterUser.id, { failedLoginAttempts: 0, lockedUntil: null } as any);
      const chapter = await storage.getChapter(chapterUser.chapterId);

      req.session.userId = chapterUser.id;
      req.session.role = "chapter";
      req.session.chapterId = chapterUser.chapterId;
      req.session.barangayId = undefined;
      req.session.barangayName = undefined;

      return req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to save session" });
        }
        res.json({
          success: true,
          user: {
            id: chapterUser.id,
            username: chapterUser.username,
            role: "chapter",
            chapterId: chapterUser.chapterId,
            chapterName: chapter?.name || "",
            mustChangePassword: chapterUser.mustChangePassword,
          },
        });
      });
    }

    const barangayUser = await storage.getBarangayUserByUsername(normalizedUsername);
    if (barangayUser) {
      if (!barangayUser.isActive) {
        return res.status(401).json({ error: "Account is inactive" });
      }

      if (barangayUser.lockedUntil && new Date(barangayUser.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(barangayUser.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
      }

      const barangayPasswordMatch = await bcrypt.compare(password, barangayUser.password);
      if (!barangayPasswordMatch) {
        const attempts = (barangayUser.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        if (attempts >= 3) {
          updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
          console.log("[Auth] Barangay account locked due to 3 failed attempts:", barangayUser.username);
        }
        await storage.updateBarangayUser(barangayUser.id, updateData);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateBarangayUser(barangayUser.id, { failedLoginAttempts: 0, lockedUntil: null } as any);
      const chapter = await storage.getChapter(barangayUser.chapterId);

      req.session.userId = barangayUser.id;
      req.session.role = "barangay";
      req.session.chapterId = barangayUser.chapterId;
      req.session.barangayId = barangayUser.id;
      req.session.barangayName = barangayUser.barangayName;

      return req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Failed to save session" });
        }
        res.json({
          success: true,
          user: {
            id: barangayUser.id,
            username: barangayUser.username,
            role: "barangay",
            chapterId: barangayUser.chapterId,
            chapterName: chapter?.name || "",
            barangayName: barangayUser.barangayName,
            mustChangePassword: barangayUser.mustChangePassword,
          },
        });
      });
    }

    return res.status(401).json({ error: "Invalid credentials" });
  });

  app.post("/api/auth/login/chapter", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();
    const user = await storage.getChapterUserByUsername(normalizedUsername);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is disabled" });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: attempts };
      if (attempts >= 3) {
        updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        console.log("[Auth] Chapter account locked due to 3 failed attempts:", user.username);
      }
      await storage.updateChapterUser(user.id, updateData);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.updateChapterUser(user.id, { failedLoginAttempts: 0, lockedUntil: null } as any);

    const chapter = await storage.getChapter(user.chapterId);

    req.session.userId = user.id;
    req.session.role = "chapter";
    req.session.chapterId = user.chapterId;
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "chapter",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          mustChangePassword: user.mustChangePassword
        } 
      });
    });
  });

  app.post("/api/auth/login/barangay", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim();
    const user = await storage.getBarangayUserByUsername(normalizedUsername);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: attempts };
      if (attempts >= 3) {
        updateData.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        console.log("[Auth] Barangay account locked due to 3 failed attempts:", user.username);
      }
      await storage.updateBarangayUser(user.id, updateData);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.updateBarangayUser(user.id, { failedLoginAttempts: 0, lockedUntil: null } as any);

    const chapter = await storage.getChapter(user.chapterId);

    req.session.userId = user.id;
    req.session.role = "barangay";
    req.session.chapterId = user.chapterId;
    req.session.barangayId = user.id;
    req.session.barangayName = user.barangayName;
    
    req.session.save((err) => {
      if (err) {
        console.error("[Auth] Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "barangay",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          barangayName: user.barangayName,
          mustChangePassword: user.mustChangePassword
        } 
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/check", async (req, res) => {
    if (!req.session.userId) {
      return res.json({ authenticated: false });
    }
    
    if (req.session.role === "admin") {
      const user = await storage.getAdminUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      return res.json({ 
        authenticated: true, 
        user: { id: user.id, username: user.username, role: "admin" } 
      });
    }

    if (req.session.role === "chapter") {
      const user = await storage.getChapterUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      const chapter = await storage.getChapter(user.chapterId);
      return res.json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "chapter",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          mustChangePassword: user.mustChangePassword
        } 
      });
    }

    if (req.session.role === "barangay") {
      const user = await storage.getBarangayUser(req.session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }
      const chapter = await storage.getChapter(user.chapterId);
      return res.json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: "barangay",
          chapterId: user.chapterId,
          chapterName: chapter?.name || "",
          barangayId: user.id,
          barangayName: user.barangayName,
          mustChangePassword: user.mustChangePassword
        } 
      });
    }

    res.json({ authenticated: false });
  });

  app.get("/api/auth/profile", requireAuth, async (req, res) => {
    if (!req.session.userId || !req.session.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.session.role === "admin") {
      const user = await storage.getAdminUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }

      return res.json({
        id: user.id,
        username: user.username,
        role: "admin",
      });
    }

    if (req.session.role === "chapter") {
      const user = await storage.getChapterUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }

      const chapter = await storage.getChapter(user.chapterId);
      return res.json({
        id: user.id,
        username: user.username,
        role: "chapter",
        chapterId: user.chapterId,
        chapterName: chapter?.name || "",
        mustChangePassword: user.mustChangePassword,
      });
    }

    if (req.session.role === "barangay") {
      const user = await storage.getBarangayUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }

      const chapter = await storage.getChapter(user.chapterId);
      return res.json({
        id: user.id,
        username: user.username,
        role: "barangay",
        chapterId: user.chapterId,
        chapterName: chapter?.name || "",
        barangayId: user.id,
        barangayName: user.barangayName,
        mustChangePassword: user.mustChangePassword,
      });
    }

    return res.status(401).json({ error: "Unauthorized" });
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    if (!req.session.userId || !req.session.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    if (!username || username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    const [existingAdmin, existingChapter, existingBarangay] = await Promise.all([
      storage.getAdminUserByUsername(username),
      storage.getChapterUserByUsername(username),
      storage.getBarangayUserByUsername(username),
    ]);

    const usernameTaken = isUsernameTakenByDifferentUser(username, req.session.role, req.session.userId, {
      admin: existingAdmin,
      chapter: existingChapter,
      barangay: existingBarangay,
    });

    if (usernameTaken) {
      return res.status(409).json({ error: "Username already exists" });
    }

    if (req.session.role === "admin") {
      const updated = await storage.updateAdminUser(req.session.userId, { username });
      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }

      return res.json({
        id: updated.id,
        username: updated.username,
        role: "admin",
      });
    }

    if (req.session.role === "chapter") {
      const updated = await storage.updateChapterUser(req.session.userId, { username } as any);
      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }

      const chapter = await storage.getChapter(updated.chapterId);
      return res.json({
        id: updated.id,
        username: updated.username,
        role: "chapter",
        chapterId: updated.chapterId,
        chapterName: chapter?.name || "",
        mustChangePassword: updated.mustChangePassword,
      });
    }

    if (req.session.role === "barangay") {
      const barangayName =
        typeof req.body?.barangayName === "string" ? req.body.barangayName.trim() : "";

      if (!barangayName) {
        return res.status(400).json({ error: "Barangay name is required" });
      }

      const updated = await storage.updateBarangayUser(req.session.userId, {
        username,
        barangayName,
      } as any);

      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }

      req.session.barangayName = updated.barangayName;

      const chapter = await storage.getChapter(updated.chapterId);
      return res.json({
        id: updated.id,
        username: updated.username,
        role: "barangay",
        chapterId: updated.chapterId,
        chapterName: chapter?.name || "",
        barangayId: updated.id,
        barangayName: updated.barangayName,
        mustChangePassword: updated.mustChangePassword,
      });
    }

    return res.status(401).json({ error: "Unauthorized" });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (!req.session.userId || !req.session.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    
    let updated;
    if (req.session.role === "admin") {
      updated = await storage.updateAdminUser(req.session.userId, {
        password: hashedPassword,
      });
    } else if (req.session.role === "barangay") {
      updated = await storage.updateBarangayUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: now
      } as any);
    } else {
      updated = await storage.updateChapterUser(req.session.userId!, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: now
      } as any);
    }

    if (!updated) {
      console.log("[Auth] Change password failed for user:", req.session.userId);
      return res.status(500).json({ error: "Failed to update password" });
    }

    console.log("[Auth] Password updated for user:", req.session.userId, "role:", req.session.role);
    res.json({ success: true, message: "Password Updated Successfully." });
  });

  app.get("/api/programs", async (req, res) => {
    const programs = await storage.getPrograms();
    res.json(programs);
  });

  app.get("/api/programs/:id", async (req, res) => {
    const program = await storage.getProgram(req.params.id);
    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }
    res.json(program);
  });

  app.post("/api/programs", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertProgramSchema.parse(req.body);
      if (validated.image) {
        validated.image = normalizeDriveUrl(validated.image);
      }
      const program = await storage.createProgram(validated);
      res.json(program);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/programs/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertProgramSchema.partial().parse(req.body);
      if (validated.image) {
        validated.image = normalizeDriveUrl(validated.image);
      }
      const program = await storage.updateProgram(req.params.id, validated);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      res.json(program);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/programs/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteProgram(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Program not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/chapters", async (req, res) => {
    const chapters = await storage.getChapters();
    res.json(chapters);
  });

  app.get("/api/chapters/:id", async (req, res) => {
    const chapter = await storage.getChapter(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }
    res.json(chapter);
  });

  app.get("/api/chapters/:id/directory", async (req, res) => {
    const chapter = await storage.getChapter(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    const directoryEntries = await storage.getPublicChapterDirectory(req.params.id);
    res.json(directoryEntries);
  });

  app.get("/api/chapters/:id/barangay-directory", async (req, res) => {
    const chapter = await storage.getChapter(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    const barangayDirectoryEntries = await storage.getPublicBarangayDirectory(req.params.id);
    res.json(barangayDirectoryEntries);
  });

  app.get("/api/chapters/:id/barangays", async (req, res) => {
    const barangays = await storage.getBarangayUsersByChapterId(req.params.id);
    res.json(barangays.filter(b => b.isActive).map(b => ({ 
      id: b.id, 
      barangayName: b.barangayName,
      chapterId: b.chapterId 
    })));
  });

  app.post("/api/chapters", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterSchema.parse(req.body);
      const chapter = await storage.createChapter(validated);
      res.json(chapter);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/chapters/:id/logo", requireAdminAuth, (req, res, next) => {
    chapterLogoUpload.single("logo")(req, res, (uploadError: any) => {
      if (!uploadError) {
        next();
        return;
      }

      if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Chapter logo must be 5MB or less" });
        return;
      }

      res.status(400).json({ error: uploadError?.message || "Invalid chapter logo upload" });
    });
  }, async (req, res) => {
    const chapterId = req.params.id;
    const existingChapter = await storage.getChapter(chapterId);

    if (!existingChapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No chapter logo file uploaded" });
    }

    const supabaseClient = getSupabaseStorageClient();

    try {
      const fileExtension = resolveImageExtension(req.file.originalname, req.file.mimetype);
      const baseFileName = `${sanitizePathSegment(existingChapter.name)}-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExtension}`;
      const storageObjectPath = [
        "chapters",
        sanitizePathSegment(chapterId),
        baseFileName,
      ].join("/");

      if (!supabaseClient) {
        const uploadsDir = ensureUploadsDir();
        const localFileName = `chapter-${sanitizePathSegment(chapterId)}-${baseFileName}`;
        const localFilePath = path.join(uploadsDir, localFileName);
        await fs.promises.writeFile(localFilePath, req.file.buffer);

        const localLogoUrl = `/uploads/${localFileName}`;
        const updatedChapter = await storage.updateChapter(chapterId, { photo: localLogoUrl });
        if (!updatedChapter) {
          return res.status(404).json({ error: "Chapter not found after upload" });
        }

        const previousLocalLogoPath = existingChapter.photo
          ? getUploadsPathFromPublicUrl(existingChapter.photo)
          : null;

        if (previousLocalLogoPath && previousLocalLogoPath !== localFileName) {
          try {
            await fs.promises.unlink(path.join(uploadsDir, previousLocalLogoPath));
          } catch {
            // Ignore cleanup failures for old fallback files.
          }
        }

        return res.json({
          url: localLogoUrl,
          photo: localLogoUrl,
          logoUrl: localLogoUrl,
          chapter: updatedChapter,
          storageProvider: "local-fallback",
        });
      }

      await ensureChapterLogoBucket(supabaseClient);

      const { error: uploadError } = await supabaseClient.storage
        .from(CHAPTER_LOGO_BUCKET)
        .upload(storageObjectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) {
        console.error("[chapter-logo-upload] upload failed", {
          chapterId,
          message: uploadError.message,
        });
        return res.status(500).json({ error: "Failed to upload chapter logo to Supabase" });
      }

      const { data: publicUrlData } = supabaseClient.storage
        .from(CHAPTER_LOGO_BUCKET)
        .getPublicUrl(storageObjectPath);

      const publicLogoUrl = publicUrlData?.publicUrl;
      if (!publicLogoUrl) {
        return res.status(500).json({ error: "Supabase did not return a public logo URL" });
      }

      const updatedChapter = await storage.updateChapter(chapterId, { photo: publicLogoUrl });
      if (!updatedChapter) {
        return res.status(404).json({ error: "Chapter not found after upload" });
      }

      const previousLogoPath = existingChapter.photo
        ? getStoragePathFromPublicUrl(existingChapter.photo, CHAPTER_LOGO_BUCKET)
        : null;

      if (previousLogoPath && previousLogoPath !== storageObjectPath) {
        const { error: deleteOldLogoError } = await supabaseClient.storage
          .from(CHAPTER_LOGO_BUCKET)
          .remove([previousLogoPath]);

        if (deleteOldLogoError) {
          console.warn("[chapter-logo-upload] failed to remove old logo", {
            chapterId,
            previousLogoPath,
            message: deleteOldLogoError.message,
          });
        }
      }

      res.json({
        url: publicLogoUrl,
        photo: publicLogoUrl,
        logoUrl: publicLogoUrl,
        chapter: updatedChapter,
        storageProvider: "supabase",
      });
    } catch (error: any) {
      console.error("[chapter-logo-upload] request failed", {
        chapterId,
        message: error?.message,
      });
      res.status(500).json({ error: "Failed to upload chapter logo to Supabase" });
    }
  });

  app.put("/api/chapters/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterSchema.partial().parse(req.body);
      const chapter = await storage.updateChapter(req.params.id, validated);
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json(chapter);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapters/:id", requireAdminAuth, async (req, res) => {
    try {
      // Check for dependent records before attempting delete
      const members = await storage.getMembersByChapter(req.params.id);
      const officers = await storage.getChapterOfficers(req.params.id);
      const chapterUsers = await storage.getChapterUsersByChapterId(req.params.id);
      const barangayUsers = await storage.getBarangayUsersByChapterId(req.params.id);
      
      const dependentCounts = [];
      if (members.length > 0) dependentCounts.push(`${members.length} member(s)`);
      if (officers.length > 0) dependentCounts.push(`${officers.length} officer(s)`);
      if (chapterUsers.length > 0) dependentCounts.push(`${chapterUsers.length} chapter account(s)`);
      if (barangayUsers.length > 0) dependentCounts.push(`${barangayUsers.length} barangay account(s)`);
      
      if (dependentCounts.length > 0) {
        return res.status(400).json({ 
          error: `Cannot delete chapter: has ${dependentCounts.join(", ")}. Please remove these records first.` 
        });
      }
      
      const deleted = await storage.deleteChapter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete chapter error:", error);
      if (error.code === '23503') {
        return res.status(400).json({ error: "Cannot delete chapter: it has dependent records. Please remove related data first." });
      }
      res.status(500).json({ error: "Failed to delete chapter" });
    }
  });

  app.get("/api/chapters/:id/users", requireAdminAuth, async (req, res) => {
    const users = await storage.getChapterUsersByChapterId(req.params.id);
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  app.get("/api/all-accounts", requireAdminAuth, async (req, res) => {
    const allChapterUsers = await storage.getAllChapterUsers();
    const allBarangayUsers = await storage.getBarangayUsers();
    const chapters = await storage.getChapters();
    const chapterMap = new Map(chapters.map(c => [c.id, c.name]));

    const accounts = [
      ...allChapterUsers.map(u => ({
        id: u.id,
        accountName: chapterMap.get(u.chapterId) || "Unknown Chapter",
        accountType: "Chapter" as const,
        username: u.username,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedUntil: u.lockedUntil,
        passwordChangedAt: u.passwordChangedAt,
        createdAt: u.createdAt,
      })),
      ...allBarangayUsers.map(u => ({
        id: u.id,
        accountName: `${u.barangayName} (${chapterMap.get(u.chapterId) || "Unknown"})`,
        accountType: "Barangay" as const,
        username: u.username,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedUntil: u.lockedUntil,
        passwordChangedAt: u.passwordChangedAt,
        createdAt: u.createdAt,
      })),
    ];

    res.json(accounts);
  });

  app.get("/api/admin-users", requireAdminAuth, async (req, res) => {
    await ensureAdminRelationshipTable();

    const currentAdminId = req.session.userId!;
    const [admins, currentAdminCreatorId] = await Promise.all([
      storage.getAdminUsers(),
      getAdminCreatorId(currentAdminId),
    ]);

    const creatorMap = await getAdminCreatorMap(admins.map((admin) => admin.id));
    const usernameMap = new Map(admins.map((admin) => [admin.id, admin.username]));

    res.json(
      admins.map((admin) => {
        const createdByAdminId = creatorMap.get(admin.id) ?? null;
        const isMotherAccount = Boolean(currentAdminCreatorId && currentAdminCreatorId === admin.id);
        return {
          id: admin.id,
          username: admin.username,
          createdAt: admin.createdAt,
          createdByAdminId,
          createdByUsername: createdByAdminId ? usernameMap.get(createdByAdminId) || null : null,
          isCurrent: admin.id === currentAdminId,
          isMotherAccount,
          canEdit: !isMotherAccount,
          canDelete: admin.id !== currentAdminId && !isMotherAccount,
        };
      }),
    );
  });

  app.post("/api/admin-users", requireAdminAuth, async (req, res) => {
    try {
      const validated = adminAccountCreateSchema.parse(req.body);
      const currentAdminId = req.session.userId!;

      const [existingAdmin, existingChapter, existingBarangay] = await Promise.all([
        storage.getAdminUserByUsername(validated.username),
        storage.getChapterUserByUsername(validated.username),
        storage.getBarangayUserByUsername(validated.username),
      ]);

      const usernameTaken = isUsernameTakenByDifferentUser(
        validated.username,
        "admin",
        "",
        {
          admin: existingAdmin,
          chapter: existingChapter,
          barangay: existingBarangay,
        },
      );

      if (usernameTaken) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(validated.password, 10);
      const createdAdmin = await storage.createAdminUser({
        username: validated.username,
        password: hashedPassword,
      });

      await setAdminCreator(createdAdmin.id, currentAdminId);

      res.status(201).json({
        id: createdAdmin.id,
        username: createdAdmin.username,
        createdAt: createdAdmin.createdAt,
        createdByAdminId: currentAdminId,
      });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/admin-users/:id", requireAdminAuth, async (req, res) => {
    try {
      const targetAdminId = req.params.id;
      const currentAdminId = req.session.userId!;

      const currentAdminCreatorId = await getAdminCreatorId(currentAdminId);
      if (currentAdminCreatorId && currentAdminCreatorId === targetAdminId) {
        return res.status(403).json({
          error: "You cannot modify the account that created your admin account.",
        });
      }

      const validated = adminAccountUpdateSchema.parse(req.body);

      if (validated.username) {
        const [existingAdmin, existingChapter, existingBarangay] = await Promise.all([
          storage.getAdminUserByUsername(validated.username),
          storage.getChapterUserByUsername(validated.username),
          storage.getBarangayUserByUsername(validated.username),
        ]);

        const usernameTaken = isUsernameTakenByDifferentUser(
          validated.username,
          "admin",
          targetAdminId,
          {
            admin: existingAdmin,
            chapter: existingChapter,
            barangay: existingBarangay,
          },
        );

        if (usernameTaken) {
          return res.status(409).json({ error: "Username already exists" });
        }
      }

      const updateData: { username?: string; password?: string } = {};
      if (validated.username) {
        updateData.username = validated.username;
      }
      if (validated.password) {
        updateData.password = await bcrypt.hash(validated.password, 10);
      }

      const updated = await storage.updateAdminUser(targetAdminId, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Admin account not found" });
      }

      const createdByAdminId = await getAdminCreatorId(updated.id);

      res.json({
        id: updated.id,
        username: updated.username,
        createdAt: updated.createdAt,
        createdByAdminId,
      });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/admin-users/:id", requireAdminAuth, async (req, res) => {
    const targetAdminId = req.params.id;
    const currentAdminId = req.session.userId!;

    if (targetAdminId === currentAdminId) {
      return res.status(400).json({ error: "You cannot delete your own admin account." });
    }

    const currentAdminCreatorId = await getAdminCreatorId(currentAdminId);
    if (currentAdminCreatorId && currentAdminCreatorId === targetAdminId) {
      return res.status(403).json({
        error: "You cannot delete the account that created your admin account.",
      });
    }

    const admins = await storage.getAdminUsers();
    if (admins.length <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin account." });
    }

    const deleted = await storage.deleteAdminUser(targetAdminId);
    if (!deleted) {
      return res.status(404).json({ error: "Admin account not found" });
    }

    await cleanupDeletedAdminCreatorLinks(targetAdminId);
    res.json({ success: true });
  });

  app.post("/api/reset-password/:accountType/:id", requireAuth, async (req, res) => {
    const { accountType, id } = req.params;
    const normalizedAccountType = accountType.toLowerCase();
    const isAdmin = req.session.role === "admin";
    const isChapter = req.session.role === "chapter";

    if (!isAdmin && !isChapter) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (normalizedAccountType !== "chapter" && normalizedAccountType !== "barangay") {
      return res.status(400).json({ error: "Unsupported account type" });
    }

    if (normalizedAccountType === "chapter" && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (normalizedAccountType === "barangay" && isChapter) {
      const scopedBarangayUser = await getScopedBarangayUser(req, id);
      if (scopedBarangayUser.status === 404) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (scopedBarangayUser.status === 403) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let updated;
    if (normalizedAccountType === "chapter") {
      updated = await storage.updateChapterUser(id, {
        password: hashedPassword,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      } as any);
    } else if (normalizedAccountType === "barangay") {
      updated = await storage.updateBarangayUser(id, {
        password: hashedPassword,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      } as any);
    }

    if (!updated) {
      return res.status(404).json({ error: "Account not found" });
    }

    console.log("[Auth] Password reset for", normalizedAccountType, "account:", id, "by role:", req.session.role);
    res.json({ success: true, temporaryPassword: tempPassword });
  });

  app.post("/api/unlock-account/:accountType/:id", requireAuth, async (req, res) => {
    const { accountType, id } = req.params;
    const normalizedAccountType = accountType.toLowerCase();
    const isAdmin = req.session.role === "admin";
    const isChapter = req.session.role === "chapter";

    if (!isAdmin && !isChapter) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (normalizedAccountType !== "chapter" && normalizedAccountType !== "barangay") {
      return res.status(400).json({ error: "Unsupported account type" });
    }

    if (normalizedAccountType === "chapter" && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (normalizedAccountType === "barangay" && isChapter) {
      const scopedBarangayUser = await getScopedBarangayUser(req, id);
      if (scopedBarangayUser.status === 404) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (scopedBarangayUser.status === 403) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    let updated;
    if (normalizedAccountType === "chapter") {
      updated = await storage.updateChapterUser(id, { failedLoginAttempts: 0, lockedUntil: null } as any);
    } else if (normalizedAccountType === "barangay") {
      updated = await storage.updateBarangayUser(id, { failedLoginAttempts: 0, lockedUntil: null } as any);
    }

    if (!updated) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json({ success: true });
  });

  app.post("/api/chapter-users", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterUserSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(validated.password, 10);
      const user = await storage.createChapterUser({ ...validated, password: hashedPassword });
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username already exists" });
      }
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-users/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterUserSchema.partial().parse(req.body);
      let updateData = validated;
      if (validated.password) {
        const hashedPassword = await bcrypt.hash(validated.password, 10);
        updateData = { ...validated, password: hashedPassword };
      }
      const user = await storage.updateChapterUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapter-users/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteChapterUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  });

  // Barangay user management routes
  app.get("/api/barangay-users", requireAuth, async (req, res) => {
    const requestedChapterId = typeof req.query.chapterId === "string" ? req.query.chapterId : undefined;

    if (req.session.role === "admin") {
      const users = requestedChapterId
        ? await storage.getBarangayUsersByChapterId(requestedChapterId)
        : await storage.getBarangayUsers();
      return res.json(users.map((u) => ({ ...u, password: undefined })));
    }

    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId;
      if (!sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (requestedChapterId && requestedChapterId !== sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const users = await storage.getBarangayUsersByChapterId(sessionChapterId);
      return res.json(users.map((u) => ({ ...u, password: undefined })));
    }

    return res.status(403).json({ error: "Access denied" });
  });

  app.get("/api/chapters/:id/barangay-users", requireAuth, async (req, res) => {
    const requestedChapterId = req.params.id;

    if (req.session.role === "admin") {
      const users = await storage.getBarangayUsersByChapterId(requestedChapterId);
      return res.json(users.map((u) => ({ ...u, password: undefined })));
    }

    if (req.session.role === "chapter") {
      if (!req.session.chapterId || req.session.chapterId !== requestedChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const users = await storage.getBarangayUsersByChapterId(requestedChapterId);
      return res.json(users.map((u) => ({ ...u, password: undefined })));
    }

    return res.status(403).json({ error: "Access denied" });
  });

  app.post("/api/barangay-users", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertBarangayUserSchema.parse(req.body);
      const user = await storage.createBarangayUser(validated);
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username already exists" });
      }
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/barangay-users/:id", requireAuth, async (req, res) => {
    try {
      const validated = insertBarangayUserSchema.partial().parse(req.body);

      const scopedBarangayUser = await getScopedBarangayUser(req, req.params.id);
      if (scopedBarangayUser.status === 404) {
        return res.status(404).json({ error: "User not found" });
      }
      if (scopedBarangayUser.status === 403) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updatePayload: Record<string, unknown> = {};

      if (req.session.role === "admin") {
        Object.assign(updatePayload, validated);
        if (typeof updatePayload.password === "string" && updatePayload.password) {
          updatePayload.password = await bcrypt.hash(updatePayload.password, 10);
        }
      } else if (req.session.role === "chapter") {
        const chapterAllowedFields: Array<keyof typeof validated> = [
          "barangayName",
          "username",
          "isActive",
          "mustChangePassword",
        ];

        for (const key of chapterAllowedFields) {
          const value = validated[key];
          if (value !== undefined) {
            updatePayload[key] = value;
          }
        }

        if (validated.password !== undefined) {
          return res.status(403).json({ error: "Use reset password action for barangay accounts" });
        }
      } else {
        return res.status(403).json({ error: "Access denied" });
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "No valid fields provided for update" });
      }

      const user = await storage.updateBarangayUser(req.params.id, updatePayload as any);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ error: "Username already exists" });
      }
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/barangay-users/:id", requireAdminAuth, async (req, res) => {
    const [linkedMembers, linkedOfficers] = await Promise.all([
      storage.getMembersByBarangay(req.params.id),
      storage.getOfficersByBarangay(req.params.id),
    ]);

    const dependencyMessages: string[] = [];
    if (linkedMembers.length > 0) {
      dependencyMessages.push(`${linkedMembers.length} member(s)`);
    }
    if (linkedOfficers.length > 0) {
      dependencyMessages.push(`${linkedOfficers.length} officer(s)`);
    }

    if (dependencyMessages.length > 0) {
      return res.status(400).json({
        error: `Cannot delete barangay: has ${dependencyMessages.join(", ")}. Reassign or clear linked records first.`,
      });
    }

    const deleted = await storage.deleteBarangayUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  });

  // Member totals and birthdays endpoints
  app.get("/api/member-totals", requireAdminAuth, async (req, res) => {
    const { chapterId, barangayId } = req.query;
    const total = await storage.getMemberTotals(
      chapterId as string | undefined, 
      barangayId as string | undefined
    );
    res.json({ total });
  });

  app.get("/api/birthdays-today", requireAdminAuth, async (req, res) => {
    const result = await storage.getBirthdaysToday();
    res.json(result);
  });

  const parseBarangayIdsCsv = (value: unknown) => {
    if (typeof value !== "string") {
      return [] as string[];
    }

    return Array.from(
      new Set(
        value
          .split(",")
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0),
      ),
    );
  };

  const resolveChapterBarangayTargets = async (chapterId: string, rawBarangayIds: unknown) => {
    const requestedBarangayIds = parseBarangayIdsCsv(rawBarangayIds);
    if (requestedBarangayIds.length === 0) {
      return {
        primaryBarangayId: undefined as string | undefined,
        barangayIdsCsv: undefined as string | undefined,
        connectedBarangayNames: [] as string[],
      };
    }

    const chapterBarangays = await storage.getBarangayUsersByChapterId(chapterId);
    const activeBarangayById = new Map(
      chapterBarangays
        .filter((barangay) => barangay.isActive)
        .map((barangay) => [barangay.id, barangay]),
    );

    const connectedBarangays = requestedBarangayIds.map((barangayId) => activeBarangayById.get(barangayId));
    if (connectedBarangays.some((barangay) => !barangay)) {
      throw new Error("Invalid barangay connection list");
    }

    const connectedBarangayNames = connectedBarangays
      .map((barangay) => barangay!.barangayName)
      .filter((name, index, source) => source.indexOf(name) === index);

    return {
      primaryBarangayId: requestedBarangayIds[0],
      barangayIdsCsv: requestedBarangayIds.join(","),
      connectedBarangayNames,
    };
  };

  app.get("/api/volunteer-opportunities", async (req, res) => {
    const opportunities = await storage.getVolunteerOpportunities();
    res.json(opportunities);
  });

  app.get("/api/volunteer-opportunities/:id", async (req, res) => {
    const opportunity = await storage.getVolunteerOpportunity(req.params.id);
    if (!opportunity) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }
    res.json(opportunity);
  });

  app.post("/api/volunteer-opportunities", requireAdminAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const selectedChapterId = typeof req.body.chapterId === "string" ? req.body.chapterId.trim() : "";
      let chapterId: string | undefined;
      let barangayId: string | undefined;
      let barangayIds: string | undefined;
      let chapterName = "YSP National";

      if (selectedChapterId && selectedChapterId !== "national") {
        const selectedChapter = await storage.getChapter(selectedChapterId);
        if (!selectedChapter) {
          return res.status(400).json({ error: "Invalid chapter selected" });
        }
        chapterId = selectedChapter.id;
        chapterName = selectedChapter.name;

        const chapterBarangayTargets = await resolveChapterBarangayTargets(chapterId, req.body.barangayIds);
        barangayId = chapterBarangayTargets.primaryBarangayId;
        barangayIds = chapterBarangayTargets.barangayIdsCsv;

        if (chapterBarangayTargets.connectedBarangayNames.length === 1) {
          chapterName = `${selectedChapter.name} - ${chapterBarangayTargets.connectedBarangayNames[0]}`;
        } else if (chapterBarangayTargets.connectedBarangayNames.length > 1) {
          chapterName = `${selectedChapter.name} - ${chapterBarangayTargets.connectedBarangayNames.join(", ")}`;
        }
      }

      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] admin create", {
        route: req.originalUrl,
        hasFile: Boolean(req.file),
        photoUrl,
      });

      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: req.body.eventName,
        date: req.body.date,
        time: normalizeOptionalText(req.body.time) || "TBD",
        venue: normalizeOptionalText(req.body.venue) || "TBD",
        chapterId,
        barangayId,
        barangayIds,
        chapter: chapterName,
        description: normalizeOptionalText(req.body.description),
        sdgs: normalizeOptionalText(req.body.sdgs) || "",
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail),
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl),
        applyUrl: normalizeOptionalText(req.body.applyUrl),
        deadlineAt: normalizeOptionalText(req.body.deadlineAt),
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || "18+",
        photoUrl
      });
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] admin create failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/:id", requireAdminAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const existing = await storage.getVolunteerOpportunity(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Volunteer opportunity not found" });
      }

      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const selectedChapterId = typeof req.body.chapterId === "string" ? req.body.chapterId.trim() : "";
      let chapterId: string | undefined;
      let barangayId: string | undefined;
      let barangayIds: string | undefined;
      let chapterName = "YSP National";
      const hasBarangayIdsPayload = typeof req.body.barangayIds === "string";

      if (selectedChapterId && selectedChapterId !== "national") {
        const selectedChapter = await storage.getChapter(selectedChapterId);
        if (!selectedChapter) {
          return res.status(400).json({ error: "Invalid chapter selected" });
        }
        chapterId = selectedChapter.id;

        if (hasBarangayIdsPayload) {
          const chapterBarangayTargets = await resolveChapterBarangayTargets(chapterId, req.body.barangayIds);
          barangayId = chapterBarangayTargets.primaryBarangayId;
          barangayIds = chapterBarangayTargets.barangayIdsCsv;

          if (chapterBarangayTargets.connectedBarangayNames.length === 1) {
            chapterName = `${selectedChapter.name} - ${chapterBarangayTargets.connectedBarangayNames[0]}`;
          } else if (chapterBarangayTargets.connectedBarangayNames.length > 1) {
            chapterName = `${selectedChapter.name} - ${chapterBarangayTargets.connectedBarangayNames.join(", ")}`;
          } else {
            chapterName = selectedChapter.name;
          }
        } else {
          barangayId = existing.barangayId || undefined;
          barangayIds = existing.barangayIds || undefined;
          chapterName = existing.chapter || selectedChapter.name;
        }
      } else {
        barangayId = undefined;
        barangayIds = undefined;
      }

      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] admin update", {
        route: req.originalUrl,
        hasFile: Boolean(req.file),
        photoUrl,
      });

      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: req.body.eventName,
        date: req.body.date,
        time: normalizeOptionalText(req.body.time) || "TBD",
        venue: normalizeOptionalText(req.body.venue) || "TBD",
        chapterId,
        barangayId,
        barangayIds,
        chapter: chapterName,
        description: normalizeOptionalText(req.body.description),
        sdgs: normalizeOptionalText(req.body.sdgs) || "",
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail),
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl),
        applyUrl: normalizeOptionalText(req.body.applyUrl),
        deadlineAt: normalizeOptionalText(req.body.deadlineAt),
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || "18+",
        photoUrl: photoUrl || existing.photoUrl || undefined,
      });

      const opportunity = await storage.updateVolunteerOpportunity(req.params.id, validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] admin update failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/volunteer-opportunities/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteVolunteerOpportunity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/stats", async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.put("/api/stats", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertStatsSchema.parse(req.body);
      const stats = await storage.updateStats(validated);
      res.json(stats);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.get("/api/contact-info", async (req, res) => {
    const info = await storage.getContactInfo();
    res.json(info);
  });

  app.put("/api/contact-info", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertContactInfoSchema.parse(req.body);
      const info = await storage.updateContactInfo(validated);
      res.json(info);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/upload/member-photo", upload.single("image"), (req, res) => {
    if (!req.file) {
      console.error("[member-photo-upload] no file received", { route: req.originalUrl });
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    console.log("[member-photo-upload] upload success", {
      route: req.originalUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      imageUrl,
    });

    res.json({ url: imageUrl });
  });

  app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
    if (!req.file) {
      console.error("[image-upload] no file received", { route: req.originalUrl });
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    console.log("[image-upload] upload success", {
      route: req.originalUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      imageUrl,
    });
    res.json({ url: imageUrl });
  });

  app.get("/api/publications", async (req, res) => {
    const chapterId = req.query.chapterId as string | undefined;
    const includeAll = (req.query.includeAll as string | undefined) === "true";
    const isAdmin = req.session?.role === "admin" && Boolean(req.session?.userId);
    const isChapterOwnScope =
      req.session?.role === "chapter" &&
      Boolean(req.session?.userId) &&
      Boolean(chapterId) &&
      req.session?.chapterId === chapterId;
    const shouldIncludeAll = includeAll && (isAdmin || isChapterOwnScope);

    const publications = chapterId
      ? shouldIncludeAll
        ? await storage.getPublicationsByChapter(chapterId)
        : await storage.getApprovedPublicationsByChapter(chapterId)
      : shouldIncludeAll
        ? await storage.getPublications()
        : await storage.getApprovedPublications();
    res.json(publications);
  });

  app.get("/api/publications/:id", async (req, res) => {
    const publication = await storage.getPublication(req.params.id);
    if (!publication) {
      return res.status(404).json({ error: "Publication not found" });
    }

    const isAdmin = req.session?.role === "admin" && Boolean(req.session?.userId);
    if (!publication.isApproved && !isAdmin) {
      return res.status(404).json({ error: "Publication not found" });
    }

    res.json(publication);
  });

  app.post("/api/publications", requireAdminAuth, async (req, res) => {
    try {
      const payload: Record<string, unknown> = { ...req.body };
      const incomingPhotoUrl =
        typeof payload.photoUrl === "string"
          ? payload.photoUrl
          : typeof payload.imageUrl === "string"
            ? payload.imageUrl
            : undefined;

      if (incomingPhotoUrl !== undefined) {
        const trimmed = incomingPhotoUrl.trim();
        payload.photoUrl = trimmed ? normalizeDriveUrl(trimmed) : null;
      }

      delete payload.imageUrl;

      const validated = insertPublicationSchema.parse(payload);
      const publication = await storage.createPublication({
        ...validated,
        isApproved: true,
        approvedAt: new Date(),
        approvedByAdminId: req.session.userId!,
      });
      res.json(publication);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/publications/:id", requireAdminAuth, async (req, res) => {
    try {
      const payload: Record<string, unknown> = { ...req.body };
      const incomingPhotoUrl =
        typeof payload.photoUrl === "string"
          ? payload.photoUrl
          : typeof payload.imageUrl === "string"
            ? payload.imageUrl
            : undefined;

      if (incomingPhotoUrl !== undefined) {
        const trimmed = incomingPhotoUrl.trim();
        payload.photoUrl = trimmed ? normalizeDriveUrl(trimmed) : null;
      }

      delete payload.imageUrl;
      delete payload.isApproved;
      delete payload.approvedAt;
      delete payload.approvedByAdminId;

      const validated = insertPublicationSchema.partial().parse(payload);
      const publication = await storage.updatePublication(req.params.id, validated);
      if (!publication) {
        return res.status(404).json({ error: "Publication not found" });
      }
      res.json(publication);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/publications/:id/approve", requireAdminAuth, async (req, res) => {
    const existing = await storage.getPublication(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Publication not found" });
    }

    if (existing.isApproved) {
      return res.json(existing);
    }

    const publication = await storage.updatePublication(req.params.id, {
      isApproved: true,
      approvedAt: new Date(),
      approvedByAdminId: req.session.userId!,
    });

    if (!publication) {
      return res.status(404).json({ error: "Publication not found" });
    }

    res.json(publication);
  });

  app.delete("/api/publications/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deletePublication(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Publication not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/project-reports", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string | undefined;
    const reports = chapterId 
      ? await storage.getProjectReportsByChapter(chapterId)
      : await storage.getProjectReports();
    res.json(reports);
  });

  app.get("/api/project-reports/:id", requireAuth, async (req, res) => {
    const report = await storage.getProjectReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "Project report not found" });
    }
    res.json(report);
  });

  app.post("/api/project-reports", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertProjectReportSchema.parse({
        ...req.body,
        chapterId
      });
      
      const report = await storage.createProjectReport(validated);

      await storage.createPublication({
        chapterId,
        sourceProjectReportId: report.id,
        title: report.projectName,
        content: report.projectWriteup,
        photoUrl: report.photoUrl,
        facebookLink: report.facebookPostLink,
        isApproved: false,
        approvedAt: null,
        approvedByAdminId: null,
      });
      
      res.json(report);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/project-reports/:id", requireAuth, async (req, res) => {
    const existing = await storage.getProjectReport(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Project report not found" });
    }

    if (req.session.role === "chapter" && existing.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (req.session.role !== "admin" && req.session.role !== "chapter") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const validated = insertProjectReportSchema.partial().parse(req.body) as Record<string, unknown>;

      if (req.session.role !== "admin") {
        delete validated.chapterId;
        delete validated.barangayId;
      }

      const report = await storage.updateProjectReport(req.params.id, validated as any);
      if (!report) {
        return res.status(404).json({ error: "Project report not found" });
      }

      await storage.updatePublicationBySourceProjectReportId(report.id, {
        chapterId: report.chapterId,
        title: report.projectName,
        content: report.projectWriteup,
        photoUrl: report.photoUrl,
        facebookLink: report.facebookPostLink,
        isApproved: false,
        approvedAt: null,
        approvedByAdminId: null,
      });

      res.json(report);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/project-reports/:id", requireAuth, async (req, res) => {
    const existing = await storage.getProjectReport(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Project report not found" });
    }

    if (req.session.role === "chapter" && existing.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (req.session.role !== "admin" && req.session.role !== "chapter") {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteProjectReport(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Project report not found" });
    }

    res.json({ success: true });
  });

  app.get("/api/chapter-kpis", requireAuth, async (req, res) => {
    const chapterId = req.query.chapterId as string;
    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }
    const kpis = await storage.getChapterKpis(chapterId);
    res.json(kpis);
  });

  app.get("/api/chapter-kpis/:chapterId/:year", requireAuth, async (req, res) => {
    const kpi = await storage.getChapterKpiByYear(req.params.chapterId, parseInt(req.params.year));
    if (!kpi) {
      return res.status(404).json({ error: "KPI not found" });
    }
    res.json(kpi);
  });

  app.post("/api/chapter-kpis", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterKpiSchema.parse(req.body);
      
      const existing = await storage.getChapterKpiByYear(validated.chapterId, validated.year);
      if (existing) {
        const updated = await storage.updateChapterKpi(existing.id, validated);
        return res.json(updated);
      }
      
      const kpi = await storage.createChapterKpi(validated);
      res.json(kpi);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-kpis/:id", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertChapterKpiSchema.partial().parse(req.body);
      const kpi = await storage.updateChapterKpi(req.params.id, validated);
      if (!kpi) {
        return res.status(404).json({ error: "KPI not found" });
      }
      res.json(kpi);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapter-kpis/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteChapterKpi(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "KPI not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/leaderboard", async (req, res) => {
    const timeframe = req.query.timeframe as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const leaderboard = await storage.getLeaderboard(timeframe, year, quarter);
    res.json(leaderboard);
  });

  app.get("/api/barangay-leaderboard", requireChapterOrBarangayAuth, async (req, res) => {
    const userChapterId = req.session.chapterId;
    if (!userChapterId) {
      return res.status(400).json({ error: "Chapter ID not found in session" });
    }
    const leaderboard = await storage.getBarangayLeaderboard(userChapterId);
    res.json(leaderboard);
  });

  type ResolvedMemberApplicationStatus = "approved" | "pending" | "rejected";
  type MemberLifecycleState = "member" | "applying" | "rejected";

  const getResolvedMemberApplicationStatus = (member: {
    applicationStatus?: string | null;
    isActive?: boolean | null;
  }): ResolvedMemberApplicationStatus => {
    const normalizedStatus = (member.applicationStatus || "").toLowerCase();
    if (normalizedStatus === "approved" || normalizedStatus === "pending" || normalizedStatus === "rejected") {
      return normalizedStatus;
    }

    return member.isActive ? "approved" : "pending";
  };

  const getMemberLifecycleState = (member: {
    applicationStatus?: string | null;
    isActive?: boolean | null;
  }): MemberLifecycleState => {
    const resolvedStatus = getResolvedMemberApplicationStatus(member);
    if (resolvedStatus === "approved") {
      return "member";
    }

    if (resolvedStatus === "pending") {
      return "applying";
    }

    return "rejected";
  };

  const enrichMemberLifecycle = <T extends { applicationStatus?: string | null; isActive?: boolean | null }>(member: T) => {
    const resolvedApplicationStatus = getResolvedMemberApplicationStatus(member);
    const memberLifecycleState = getMemberLifecycleState(member);

    return {
      ...member,
      resolvedApplicationStatus,
      memberLifecycleState,
      isCurrentMember: memberLifecycleState === "member",
      isApplying: memberLifecycleState === "applying",
    };
  };

  const canSessionManageMember = (
    req: Request,
    member: { chapterId: string | null; barangayId: string | null },
  ) => {
    if (req.session.role === "admin") {
      return true;
    }

    if (req.session.role === "chapter") {
      return Boolean(req.session.chapterId && member.chapterId === req.session.chapterId);
    }

    if (req.session.role === "barangay") {
      return Boolean(req.session.barangayId && member.barangayId === req.session.barangayId);
    }

    return false;
  };

  app.get("/api/members", requireAuth, async (req, res) => {
    await ensureBackfilledMemberApplicationReferenceIds();

    const chapterId = req.query.chapterId as string | undefined;
    const barangayId = req.query.barangayId as string | undefined;
    
    if (req.session.role === "admin") {
      const members = chapterId && chapterId !== "all"
        ? await storage.getMembersByChapter(chapterId)
        : await storage.getMembers();
      res.json(members.map(enrichMemberLifecycle));
    } else if (req.session.role === "chapter") {
      const members = await storage.getMembersByChapter(req.session.chapterId!);
      res.json(members.map(enrichMemberLifecycle));
    } else if (req.session.role === "barangay") {
      const members = await storage.getMembersByBarangay(req.session.barangayId!);
      res.json(members.map(enrichMemberLifecycle));
    } else {
      res.status(403).json({ error: "Access denied" });
    }
  });

  app.get("/api/household-summary", requireAdminAuth, async (req, res) => {
    const summary = await storage.getHouseholdSummary();
    res.json(summary);
  });

  app.get("/api/members/application-status/:referenceId", async (req, res) => {
    try {
      await ensureBackfilledMemberApplicationReferenceIds();

      const normalizedReferenceId = normalizeApplicationReferenceId(req.params.referenceId || "");
      if (!APPLICATION_REFERENCE_REGEX.test(normalizedReferenceId)) {
        return res.status(400).json({ error: "Invalid reference format. Use YSPAP-XXXX-YYYY." });
      }

      const member = await storage.getMemberByApplicationReferenceId(normalizedReferenceId);
      if (!member) {
        return res.status(404).json({ error: "Application not found" });
      }

      const chapter = member.chapterId ? await storage.getChapter(member.chapterId) : undefined;
      const lookupStatus = getResolvedMemberApplicationStatus(member);
      const memberLifecycleState = getMemberLifecycleState(member);

      res.json({
        referenceId: normalizedReferenceId,
        status: lookupStatus,
        resolvedApplicationStatus: lookupStatus,
        memberLifecycleState,
        isCurrentMember: memberLifecycleState === "member",
        isApplying: memberLifecycleState === "applying",
        submittedAt: member.createdAt,
        chapterName: chapter?.name || null,
        chapterLocation: chapter?.location || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to lookup application" });
    }
  });

  app.post("/api/members", async (req, res) => {
    try {
      await ensureBackfilledMemberApplicationReferenceIds();

      const requestedChapterId =
        typeof req.body.chapterId === "string" ? req.body.chapterId.trim() : "";
      if (!requestedChapterId) {
        return res.status(400).json({ error: "Chapter is required" });
      }

      const rawBarangaySelection =
        typeof req.body.barangayId === "string" ? req.body.barangayId.trim() : "";
      const normalizedBarangaySelection = rawBarangaySelection.toLowerCase() === "chapter-direct"
        ? ""
        : rawBarangaySelection;
      const resolvedBarangayId = normalizedBarangaySelection || null;

      if (resolvedBarangayId) {
        const chapterBarangays = await storage.getBarangayUsersByChapterId(requestedChapterId);
        const isValidBarangay = chapterBarangays.some(
          (barangay) => barangay.id === resolvedBarangayId && barangay.isActive,
        );
        if (!isValidBarangay) {
          return res.status(400).json({ error: "Invalid barangay for the selected chapter" });
        }
      }

      const rawEmail = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!rawEmail || !BASIC_EMAIL_REGEX.test(rawEmail)) {
        return res.status(400).json({ error: "A valid email address is required" });
      }

      const rawPhotoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : "";
      const resolvedPhotoUrl = rawPhotoUrl || null;

      const requestedReferenceId =
        typeof req.body.applicationReferenceId === "string"
          ? normalizeApplicationReferenceId(req.body.applicationReferenceId)
          : "";

      const applicationReferenceId = APPLICATION_REFERENCE_REGEX.test(requestedReferenceId)
        ? requestedReferenceId
        : await generateUniqueMemberApplicationReferenceId();

      const rawRequestedStatus =
        typeof req.body.applicationStatus === "string" ? req.body.applicationStatus.trim().toLowerCase() : "";
      const requestedIsActive = Boolean(req.body.isActive ?? false);
      const normalizedApplicationStatus = MEMBER_APPLICATION_STATUSES.includes(
        rawRequestedStatus as typeof MEMBER_APPLICATION_STATUSES[number],
      )
        ? rawRequestedStatus
        : requestedIsActive
          ? "approved"
          : "pending";
      const resolvedIsActive = normalizedApplicationStatus === "approved";

      const memberData = {
        ...req.body,
        chapterId: requestedChapterId,
        barangayId: resolvedBarangayId,
        email: rawEmail,
        photoUrl: resolvedPhotoUrl,
        applicationReferenceId,
        applicationStatus: normalizedApplicationStatus,
        isActive: resolvedIsActive,
      };
      const validated = insertMemberSchema.parse(memberData);
      const member = await storage.createMember(validated);
      res.json(member);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/members/:id", requireAuth, async (req, res) => {
    try {
      const member = await storage.getMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (req.session.role === "chapter") {
        if (member.chapterId !== req.session.chapterId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (req.session.role === "barangay") {
        if (!req.session.barangayId || member.barangayId !== req.session.barangayId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (req.session.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      const allowedFieldsByRole: Record<string, string[]> = {
        admin: ["isActive", "applicationStatus", "registeredVoter", "fullName", "age", "birthdate", "contactNumber", "email", "facebookLink", "photoUrl", "chapterId", "barangayId"],
        chapter: ["isActive", "applicationStatus", "registeredVoter", "fullName", "age", "birthdate", "contactNumber", "email", "facebookLink", "photoUrl", "barangayId", "householdSize"],
        barangay: ["isActive", "applicationStatus", "registeredVoter", "fullName", "age", "birthdate", "contactNumber", "email", "facebookLink"],
      };

      const allowedFields = allowedFieldsByRole[req.session.role || ""] || [];
      const updateData: Record<string, any> = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields provided for update" });
      }

      if (updateData.householdSize !== undefined) {
        const parsedHouseholdSize = Number(updateData.householdSize);
        if (!Number.isInteger(parsedHouseholdSize) || parsedHouseholdSize < 1) {
          return res.status(400).json({ error: "Household size must be a whole number of at least 1" });
        }
        updateData.householdSize = parsedHouseholdSize;
      }

      if (updateData.birthdate !== undefined) {
        if (updateData.birthdate === null || updateData.birthdate === "") {
          updateData.birthdate = null;
        } else if (typeof updateData.birthdate === "string") {
          const normalizedBirthdate = updateData.birthdate.trim();
          if (!normalizedBirthdate) {
            updateData.birthdate = null;
          } else {
            const parsedBirthdate = new Date(normalizedBirthdate);
            if (Number.isNaN(parsedBirthdate.getTime())) {
              return res.status(400).json({ error: "Invalid birthdate" });
            }
            updateData.birthdate = parsedBirthdate;
          }
        } else {
          return res.status(400).json({ error: "Invalid birthdate" });
        }
      }

      if (updateData.email !== undefined) {
        if (updateData.email === null || updateData.email === "") {
          updateData.email = null;
        } else if (typeof updateData.email === "string") {
          const normalizedEmail = updateData.email.trim().toLowerCase();
          if (!normalizedEmail || !BASIC_EMAIL_REGEX.test(normalizedEmail)) {
            return res.status(400).json({ error: "Invalid email address" });
          }

          updateData.email = normalizedEmail;
        } else {
          return res.status(400).json({ error: "Invalid email address" });
        }
      }

      if (updateData.photoUrl !== undefined) {
        if (updateData.photoUrl === null) {
          updateData.photoUrl = null;
        } else if (typeof updateData.photoUrl === "string") {
          updateData.photoUrl = updateData.photoUrl.trim() || null;
        } else {
          return res.status(400).json({ error: "Invalid photo URL" });
        }
      }

      if (updateData.chapterId !== undefined) {
        if (typeof updateData.chapterId !== "string" || !updateData.chapterId.trim()) {
          return res.status(400).json({ error: "Invalid chapter" });
        }

        updateData.chapterId = updateData.chapterId.trim();
      }

      if (updateData.barangayId !== undefined) {
        if (updateData.barangayId === null) {
          updateData.barangayId = null;
        } else if (typeof updateData.barangayId === "string") {
          const normalizedBarangayId = updateData.barangayId.trim();
          updateData.barangayId =
            !normalizedBarangayId || normalizedBarangayId.toLowerCase() === "chapter-direct"
              ? null
              : normalizedBarangayId;
        } else {
          return res.status(400).json({ error: "Invalid barangay" });
        }
      }

      if (updateData.applicationStatus !== undefined) {
        if (typeof updateData.applicationStatus !== "string") {
          return res.status(400).json({ error: "Invalid application status" });
        }

        const normalizedApplicationStatus = updateData.applicationStatus.trim().toLowerCase();
        if (!MEMBER_APPLICATION_STATUSES.includes(normalizedApplicationStatus as typeof MEMBER_APPLICATION_STATUSES[number])) {
          return res.status(400).json({ error: "Invalid application status" });
        }

        updateData.applicationStatus = normalizedApplicationStatus;
        updateData.isActive = normalizedApplicationStatus === "approved";
      } else if (updateData.isActive !== undefined) {
        updateData.applicationStatus = updateData.isActive ? "approved" : "pending";
      }

      if (updateData.barangayId) {
        const chapterIdForBarangayValidation = req.session.role === "chapter"
          ? req.session.chapterId
          : updateData.chapterId || member.chapterId;

        if (!chapterIdForBarangayValidation) {
          return res.status(400).json({ error: "Cannot assign barangay without a chapter" });
        }

        const chapterBarangays = await storage.getBarangayUsersByChapterId(chapterIdForBarangayValidation);
        const isValidBarangay = chapterBarangays.some(
          (barangay) => barangay.id === updateData.barangayId && barangay.isActive,
        );
        if (!isValidBarangay) {
          return res.status(400).json({ error: "Invalid barangay for this chapter" });
        }
      }

      const updated = await storage.updateMember(req.params.id, updateData);
      res.json(updated);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/members/:id/duplicate", requireAuth, async (req, res) => {
    try {
      const member = await storage.getMember(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (!canSessionManageMember(req, member)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (getResolvedMemberApplicationStatus(member) !== "pending") {
        return res.status(400).json({ error: "Only pending applications can be deleted from duplicate review" });
      }

      const deleted = await storage.deleteMember(member.id);
      if (!deleted) {
        return res.status(404).json({ error: "Member not found" });
      }

      res.json({ success: true, deletedMemberId: member.id });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to delete duplicate application" });
    }
  });

  app.post("/api/members/:id/merge", requireAuth, async (req, res) => {
    try {
      const primaryMemberId = req.params.id;
      const duplicateMemberId =
        typeof req.body.duplicateMemberId === "string" ? req.body.duplicateMemberId.trim() : "";

      if (!duplicateMemberId) {
        return res.status(400).json({ error: "duplicateMemberId is required" });
      }

      if (primaryMemberId === duplicateMemberId) {
        return res.status(400).json({ error: "Cannot merge a member with itself" });
      }

      const [primaryMember, duplicateMember] = await Promise.all([
        storage.getMember(primaryMemberId),
        storage.getMember(duplicateMemberId),
      ]);

      if (!primaryMember || !duplicateMember) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (!canSessionManageMember(req, primaryMember) || !canSessionManageMember(req, duplicateMember)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (getResolvedMemberApplicationStatus(duplicateMember) !== "pending") {
        return res.status(400).json({ error: "Only pending duplicate applications can be merged" });
      }

      const rawFieldSources = req.body?.fieldSources;
      if (
        rawFieldSources !== undefined &&
        (typeof rawFieldSources !== "object" || rawFieldSources === null || Array.isArray(rawFieldSources))
      ) {
        return res.status(400).json({ error: "fieldSources must be an object keyed by merge field" });
      }

      const mergeSelectableFields = ["fullName", "contactNumber", "email", "facebookLink", "birthdate", "age", "photoUrl", "barangayId"] as const;
      type MergeSelectableField = typeof mergeSelectableFields[number];
      const mergeFieldSourceByKey = new Map<MergeSelectableField, "primary" | "duplicate">();

      if (rawFieldSources) {
        const fieldSourcesRecord = rawFieldSources as Record<string, unknown>;
        for (const fieldKey of mergeSelectableFields) {
          const requestedSourceMemberId = fieldSourcesRecord[fieldKey];
          if (requestedSourceMemberId === undefined || requestedSourceMemberId === null) {
            continue;
          }

          if (typeof requestedSourceMemberId !== "string") {
            return res.status(400).json({ error: `fieldSources.${fieldKey} must be a member ID string` });
          }

          const normalizedSourceMemberId = requestedSourceMemberId.trim();
          if (!normalizedSourceMemberId) {
            continue;
          }

          if (normalizedSourceMemberId !== primaryMember.id && normalizedSourceMemberId !== duplicateMember.id) {
            return res.status(400).json({ error: `fieldSources.${fieldKey} must reference either the primary or duplicate member` });
          }

          mergeFieldSourceByKey.set(
            fieldKey,
            normalizedSourceMemberId === primaryMember.id ? "primary" : "duplicate",
          );
        }
      }

      const statusRank: Record<string, number> = {
        rejected: 0,
        pending: 1,
        approved: 2,
      };

      const primaryStatus = getResolvedMemberApplicationStatus(primaryMember);
      const duplicateStatus = getResolvedMemberApplicationStatus(duplicateMember);
      const mergedStatus =
        (statusRank[primaryStatus] || 0) >= (statusRank[duplicateStatus] || 0)
          ? primaryStatus
          : duplicateStatus;

      const getSourceMemberForField = (fieldKey: MergeSelectableField) => {
        const source = mergeFieldSourceByKey.get(fieldKey);
        if (!source) {
          return null;
        }

        return source === "primary" ? primaryMember : duplicateMember;
      };

      const normalizeOptionalString = (value: unknown) => {
        if (value === null || value === undefined) {
          return null;
        }

        if (typeof value !== "string") {
          return null;
        }

        const trimmedValue = value.trim();
        return trimmedValue || null;
      };

      const resolveRequiredStringField = (fieldKey: Extract<MergeSelectableField, "fullName" | "contactNumber">, fallbackValue: string) => {
        const sourceMember = getSourceMemberForField(fieldKey);
        if (!sourceMember) {
          return fallbackValue;
        }

        const selectedValue = sourceMember[fieldKey];
        if (typeof selectedValue === "string" && selectedValue.trim()) {
          return selectedValue;
        }

        return fallbackValue;
      };

      const resolveOptionalStringField = (
        fieldKey: Extract<MergeSelectableField, "email" | "facebookLink" | "photoUrl">,
        fallbackValue: string | null,
      ) => {
        const sourceMember = getSourceMemberForField(fieldKey);
        if (!sourceMember) {
          return normalizeOptionalString(fallbackValue);
        }

        const selectedValue = sourceMember[fieldKey];
        if (selectedValue === null) {
          return null;
        }

        if (selectedValue === undefined) {
          return normalizeOptionalString(fallbackValue);
        }

        return normalizeOptionalString(selectedValue) ?? normalizeOptionalString(fallbackValue);
      };

      const resolveBarangayField = (fallbackValue: string | null) => {
        const sourceMember = getSourceMemberForField("barangayId");
        if (!sourceMember) {
          return fallbackValue;
        }

        const selectedBarangayId = sourceMember.barangayId;
        if (selectedBarangayId === null || selectedBarangayId === undefined) {
          return null;
        }

        if (typeof selectedBarangayId !== "string") {
          return fallbackValue;
        }

        const normalizedBarangayId = selectedBarangayId.trim();
        return normalizedBarangayId || null;
      };

      const resolveAgeField = (fallbackValue: number) => {
        const sourceMember = getSourceMemberForField("age");
        if (!sourceMember) {
          return fallbackValue;
        }

        const selectedAge = sourceMember.age;
        if (typeof selectedAge === "number" && Number.isFinite(selectedAge) && selectedAge > 0) {
          return selectedAge;
        }

        return fallbackValue;
      };

      const resolveBirthdateField = (fallbackValue: Date | string | null) => {
        const sourceMember = getSourceMemberForField("birthdate");
        if (!sourceMember) {
          return fallbackValue;
        }

        const selectedBirthdate = sourceMember.birthdate;
        if (selectedBirthdate === null) {
          return null;
        }

        if (selectedBirthdate instanceof Date) {
          return selectedBirthdate;
        }

        if (typeof selectedBirthdate === "string") {
          const parsed = new Date(selectedBirthdate);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed;
          }
        }

        return fallbackValue;
      };

      const fallbackFullName = primaryMember.fullName || duplicateMember.fullName;
      const fallbackContactNumber = primaryMember.contactNumber || duplicateMember.contactNumber;
      const fallbackAge =
        typeof primaryMember.age === "number"
          ? primaryMember.age
          : typeof duplicateMember.age === "number"
            ? duplicateMember.age
            : 18;
      const fallbackBirthdate = primaryMember.birthdate ?? duplicateMember.birthdate ?? null;
      const fallbackEmail = normalizeOptionalString(primaryMember.email) ?? normalizeOptionalString(duplicateMember.email);
      const fallbackFacebookLink = normalizeOptionalString(primaryMember.facebookLink) ?? normalizeOptionalString(duplicateMember.facebookLink);
      const fallbackPhotoUrl = normalizeOptionalString(primaryMember.photoUrl) ?? normalizeOptionalString(duplicateMember.photoUrl);
      const fallbackBarangayId = normalizeOptionalString(primaryMember.barangayId) ?? normalizeOptionalString(duplicateMember.barangayId);

      const primaryHouseholdVoters = typeof primaryMember.householdVoters === "number" ? primaryMember.householdVoters : null;
      const duplicateHouseholdVoters = typeof duplicateMember.householdVoters === "number" ? duplicateMember.householdVoters : null;
      const mergedHouseholdVoters =
        primaryHouseholdVoters !== null || duplicateHouseholdVoters !== null
          ? Math.max(primaryHouseholdVoters || 0, duplicateHouseholdVoters || 0)
          : null;

      const mergedUpdateData: Record<string, any> = {
        fullName: resolveRequiredStringField("fullName", fallbackFullName),
        age: resolveAgeField(fallbackAge),
        birthdate: resolveBirthdateField(fallbackBirthdate),
        chapterId: primaryMember.chapterId || duplicateMember.chapterId,
        barangayId: resolveBarangayField(fallbackBarangayId),
        contactNumber: resolveRequiredStringField("contactNumber", fallbackContactNumber),
        email: resolveOptionalStringField("email", fallbackEmail),
        facebookLink: resolveOptionalStringField("facebookLink", fallbackFacebookLink),
        photoUrl: resolveOptionalStringField("photoUrl", fallbackPhotoUrl),
        registeredVoter: Boolean(primaryMember.registeredVoter || duplicateMember.registeredVoter),
        householdSize: Math.max(primaryMember.householdSize || 1, duplicateMember.householdSize || 1),
        householdVoters: mergedHouseholdVoters,
        newsletterOptIn: Boolean(primaryMember.newsletterOptIn || duplicateMember.newsletterOptIn),
        sector: primaryMember.sector || duplicateMember.sector,
        sectorOther: primaryMember.sectorOther || duplicateMember.sectorOther,
        applicationStatus: mergedStatus,
        isActive: mergedStatus === "approved",
      };

      const mergedMember = await storage.updateMember(primaryMember.id, mergedUpdateData);
      if (!mergedMember) {
        return res.status(500).json({ error: "Failed to update primary application during merge" });
      }

      const deletedDuplicate = await storage.deleteMember(duplicateMember.id);
      if (!deletedDuplicate) {
        return res.status(500).json({ error: "Merged primary application but failed to delete duplicate" });
      }

      res.json({
        success: true,
        mergedPrimaryMemberId: mergedMember.id,
        deletedDuplicateMemberId: duplicateMember.id,
      });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to merge duplicate applications" });
    }
  });

  app.delete("/api/members/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteMember(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Member not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/officers", requireAdminAuth, async (req, res) => {
    const officers = await storage.getAllOfficers();
    res.json(officers);
  });

  app.get("/api/chapter-officers", requireAuth, async (req, res) => {
    const requestedChapterId = req.query.chapterId as string | undefined;
    const requestedBarangayId = req.query.barangayId as string | undefined;
    const level = req.query.level as string | undefined;

    if (req.session.role === "admin") {
      if (!requestedChapterId) {
        return res.status(400).json({ error: "chapterId required" });
      }

      if (requestedBarangayId && level === "barangay") {
        const officers = await storage.getOfficersByBarangay(requestedBarangayId);
        return res.json(officers);
      }

      const officers = await storage.getChapterOfficers(requestedChapterId);
      return res.json(officers);
    }

    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId!;

      if (requestedChapterId && requestedChapterId !== sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (requestedBarangayId && level === "barangay") {
        const chapterBarangays = await storage.getBarangayUsersByChapterId(sessionChapterId);
        const isValidBarangay = chapterBarangays.some((barangay) => barangay.id === requestedBarangayId);
        if (!isValidBarangay) {
          return res.status(403).json({ error: "Access denied" });
        }

        const officers = await storage.getOfficersByBarangay(requestedBarangayId);
        return res.json(officers);
      }

      const officers = await storage.getChapterOfficers(sessionChapterId);
      return res.json(officers);
    }

    if (req.session.role === "barangay") {
      if (!req.session.barangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (requestedBarangayId && requestedBarangayId !== req.session.barangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const officers = await storage.getOfficersByBarangay(req.session.barangayId);
      return res.json(officers);
    }

    return res.status(403).json({ error: "Access denied" });
  });

  app.post("/api/chapter-officers", requireChapterOrBarangayAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const barangayId = req.session.role === "barangay" ? req.session.barangayId : req.body.barangayId;
      const level = req.session.role === "barangay" ? "barangay" : (req.body.level || "chapter");
      
      const validated = insertChapterOfficerSchema.parse({
        ...req.body,
        chapterId,
        barangayId: barangayId || null,
        level
      });
      const officer = await storage.createChapterOfficer(validated);
      res.json(officer);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/chapter-officers/:id", requireChapterOrBarangayAuth, async (req, res) => {
    try {
      const existingOfficer = await storage.getChapterOfficer(req.params.id);
      if (!existingOfficer) {
        return res.status(404).json({ error: "Officer not found" });
      }

      if (req.session.role === "chapter" && existingOfficer.chapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (req.session.role === "barangay" && existingOfficer.barangayId !== req.session.barangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validated = insertChapterOfficerSchema.partial().parse(req.body) as Record<string, unknown>;
      delete validated.chapterId;

      if (req.session.role === "barangay") {
        delete validated.barangayId;
        validated.level = "barangay";
      }

      const officer = await storage.updateChapterOfficer(req.params.id, validated as any);
      if (!officer) {
        return res.status(404).json({ error: "Officer not found" });
      }
      res.json(officer);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/chapter-officers/:id", requireChapterOrBarangayAuth, async (req, res) => {
    const existingOfficer = await storage.getChapterOfficer(req.params.id);
    if (!existingOfficer) {
      return res.status(404).json({ error: "Officer not found" });
    }

    if (req.session.role === "chapter" && existingOfficer.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (req.session.role === "barangay" && existingOfficer.barangayId !== req.session.barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteChapterOfficer(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Officer not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/kpi-templates", requireAuth, async (req, res) => {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const barangayScope = req.query.barangayScope === "true";
    const requestedBarangayId = req.query.barangayId as string | undefined;
    const requestedChapterId = req.query.chapterId as string | undefined;
    const chapterScope = req.query.chapterScope === "true";

    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId;
      if (!sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (barangayScope) {
        const chapterBarangayIds = await getChapterBarangayIdSet(sessionChapterId);
        if (requestedBarangayId && !chapterBarangayIds.has(requestedBarangayId)) {
          return res.status(403).json({ error: "Access denied" });
        }

        const templates = await storage.getKpiTemplatesForBarangay(year, requestedBarangayId, sessionChapterId, quarter);
        return res.json(templates);
      }

      const templates = await storage.getKpiTemplatesForChapter(year, sessionChapterId, quarter);
      return res.json(templates);
    }

    if (req.session.role === "barangay") {
      const sessionChapterId = req.session.chapterId;
      const sessionBarangayId = req.session.barangayId;
      if (!sessionChapterId || !sessionBarangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const templates = await storage.getKpiTemplatesForBarangay(year, sessionBarangayId, sessionChapterId, quarter);
      return res.json(templates);
    }
    
    if (barangayScope && requestedBarangayId) {
      const templates = await storage.getKpiTemplatesForBarangay(year, requestedBarangayId, requestedChapterId, quarter);
      res.json(templates);
    } else if (chapterScope && requestedChapterId) {
      const templates = await storage.getKpiTemplatesForChapter(year, requestedChapterId, quarter);
      res.json(templates);
    } else {
      const templates = await storage.getKpiTemplates(year, quarter);
      res.json(templates);
    }
  });

  app.get("/api/kpi-templates/:id", requireAuth, async (req, res) => {
    const template = await storage.getKpiTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "KPI template not found" });
    }
    res.json(template);
  });

  app.get("/api/kpi-templates/:id/scopes", requireAuth, async (req, res) => {
    if (req.session.role === "admin") {
      const scopes = await storage.getKpiScopesByTemplateId(req.params.id);
      return res.json(scopes);
    }

    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId;
      if (!sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const manageableContext = await getChapterManageableKpiTemplateContext(req.params.id, sessionChapterId);
      if (!manageableContext) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.json(manageableContext.scopes);
    }

    return res.status(403).json({ error: "Access denied" });
  });

  app.get("/api/kpi-templates/:id/barangay-analytics", requireAuth, async (req, res) => {
    const templateId = req.params.id;
    const template = await storage.getKpiTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "KPI template not found" });
    }

    const scopes = await storage.getKpiScopesByTemplateId(templateId);
    const assignedBarangayIds = Array.from(
      new Set(
        scopes
          .filter((scope) => scope.entityType === "barangay")
          .map((scope) => scope.entityId),
      ),
    );

    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId;
      if (!sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const manageableContext = await getChapterManageableKpiTemplateContext(templateId, sessionChapterId);
      if (!manageableContext) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else if (req.session.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const dependencyConfig = parseKpiDependencyConfig(template.linkedEntityId);
    const chapterMetricCache = new Map<KpiDependencyMetric, number>();

    const assignedBarangayEntries = await Promise.all(
      assignedBarangayIds.map(async (barangayId) => {
        const barangayUser = await storage.getBarangayUser(barangayId);
        if (!barangayUser) {
          return null;
        }

        const chapterId = barangayUser.chapterId;
        let accomplished = false;
        const ruleEvaluations: Array<{
          metric: KpiDependencyMetric;
          metricLabel: string;
          operator: string;
          operatorLabel: string;
          targetValue: number;
          currentValue: number;
          passed: boolean;
          description: string;
        }> = [];

        if (dependencyConfig) {
          for (const rule of dependencyConfig.rules) {
            const currentValue = await resolveDependencyMetricByBarangay(
              rule.metric,
              chapterId,
              barangayId,
              chapterMetricCache,
            );
            const passed = evaluateKpiDependencyRule(currentValue, rule.operator, rule.targetValue);
            ruleEvaluations.push({
              metric: rule.metric,
              metricLabel: KPI_DEPENDENCY_METRIC_LABELS[rule.metric],
              operator: rule.operator,
              operatorLabel: KPI_DEPENDENCY_OPERATOR_LABELS[rule.operator],
              targetValue: rule.targetValue,
              currentValue,
              passed,
              description: formatKpiDependencyRuleDescription(rule.metric, rule.operator, rule.targetValue),
            });
          }

          accomplished =
            dependencyConfig.aggregation === "any"
              ? ruleEvaluations.some((rule) => rule.passed)
              : ruleEvaluations.every((rule) => rule.passed);
        } else {
          const barangayCompletion = await storage.getKpiCompletionByTemplateAndBarangay(template.id, barangayId);
          accomplished = Boolean(barangayCompletion?.isCompleted);
        }

        return {
          barangayId,
          barangayName: barangayUser.barangayName,
          chapterId,
          accomplished,
          ruleEvaluations,
        };
      }),
    );

    const assignedBarangays = assignedBarangayEntries.filter(
      (entry): entry is NonNullable<typeof entry> => Boolean(entry),
    );

    const accomplishedCount = assignedBarangays.filter((barangay) => barangay.accomplished).length;
    const assignedCount = assignedBarangays.length;

    return res.json({
      template,
      dependencySummary: dependencyConfig ? summarizeKpiDependencyConfig(dependencyConfig) : null,
      assignedBarangays,
      assignedCount,
      accomplishedCount,
      pendingCount: Math.max(assignedCount - accomplishedCount, 0),
    });
  });

  app.post("/api/kpi-templates", requireAuth, async (req, res) => {
    try {
      const { selectedEntityIds, ...templateData } = req.body;
      const validated = insertKpiTemplateSchema.parse(templateData);

      if (req.session.role !== "admin" && req.session.role !== "chapter") {
        return res.status(403).json({ error: "Access denied" });
      }

      if (req.session.role === "chapter") {
        const sessionChapterId = req.session.chapterId;
        if (!sessionChapterId) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (validated.scope !== "selected_barangays") {
          return res.status(403).json({ error: "Chapters can only assign KPI templates to selected barangays." });
        }

        if (!Array.isArray(selectedEntityIds) || selectedEntityIds.length === 0) {
          return res.status(400).json({ error: "Select at least one barangay." });
        }

        const chapterBarangayIds = await getChapterBarangayIdSet(sessionChapterId);
        const hasInvalidBarangay = selectedEntityIds.some(
          (entityId: string) => !chapterBarangayIds.has(entityId),
        );

        if (hasInvalidBarangay) {
          return res.status(403).json({ error: "One or more barangays are outside your chapter." });
        }
      }

      const template = await storage.createKpiTemplate(validated);
      
      if (selectedEntityIds && selectedEntityIds.length > 0 && 
          (validated.scope === "selected_chapters" || validated.scope === "selected_barangays")) {
        const entityType = validated.scope === "selected_chapters" ? "chapter" : "barangay";
        const scopes = selectedEntityIds.map((entityId: string) => ({
          kpiTemplateId: template.id,
          entityType,
          entityId
        }));
        await storage.createKpiScopes(scopes);
      }
      
      res.json(template);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/kpi-templates/:id", requireAuth, async (req, res) => {
    try {
      const { selectedEntityIds, ...templateData } = req.body;
      const validated = insertKpiTemplateSchema.partial().parse(templateData) as Record<string, any>;

      if (req.session.role === "chapter") {
        const sessionChapterId = req.session.chapterId;
        if (!sessionChapterId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const manageableContext = await getChapterManageableKpiTemplateContext(req.params.id, sessionChapterId);
        if (!manageableContext) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (validated.scope && validated.scope !== "selected_barangays") {
          return res.status(403).json({ error: "Chapters can only assign KPI templates to selected barangays." });
        }

        if (!Array.isArray(selectedEntityIds) || selectedEntityIds.length === 0) {
          return res.status(400).json({ error: "Select at least one barangay." });
        }

        const chapterBarangayIds = await getChapterBarangayIdSet(sessionChapterId);
        const hasInvalidBarangay = selectedEntityIds.some(
          (entityId: string) => !chapterBarangayIds.has(entityId),
        );
        if (hasInvalidBarangay) {
          return res.status(403).json({ error: "One or more barangays are outside your chapter." });
        }

        const template = await storage.updateKpiTemplate(req.params.id, {
          ...validated,
          scope: "selected_barangays",
        });
        if (!template) {
          return res.status(404).json({ error: "KPI template not found" });
        }

        await storage.deleteKpiScopesByTemplateId(req.params.id);
        const scopes = selectedEntityIds.map((entityId: string) => ({
          kpiTemplateId: template.id,
          entityType: "barangay",
          entityId,
        }));
        await storage.createKpiScopes(scopes);
        return res.json(template);
      }

      if (req.session.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      const template = await storage.updateKpiTemplate(req.params.id, validated);
      if (!template) {
        return res.status(404).json({ error: "KPI template not found" });
      }
      
      if (validated.scope === "selected_chapters" || validated.scope === "selected_barangays") {
        await storage.deleteKpiScopesByTemplateId(req.params.id);
        if (selectedEntityIds && selectedEntityIds.length > 0) {
          const entityType = validated.scope === "selected_chapters" ? "chapter" : "barangay";
          const scopes = selectedEntityIds.map((entityId: string) => ({
            kpiTemplateId: template.id,
            entityType,
            entityId
          }));
          await storage.createKpiScopes(scopes);
        }
      } else if (validated.scope) {
        await storage.deleteKpiScopesByTemplateId(req.params.id);
      }
      
      res.json(template);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/kpi-templates/:id", requireAuth, async (req, res) => {
    if (req.session.role === "chapter") {
      const sessionChapterId = req.session.chapterId;
      if (!sessionChapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const manageableContext = await getChapterManageableKpiTemplateContext(req.params.id, sessionChapterId);
      if (!manageableContext) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteKpiTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "KPI template not found" });
      }
      return res.json({ success: true });
    }

    if (req.session.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteKpiTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "KPI template not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/kpi-completions", requireAuth, async (req, res) => {
    const requestedChapterId = req.query.chapterId as string | undefined;
    let effectiveChapterId = requestedChapterId;

    if (req.session.role === "admin") {
      if (!effectiveChapterId) {
        return res.status(400).json({ error: "chapterId required" });
      }
    } else if (req.session.role === "chapter" || req.session.role === "barangay") {
      if (!req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (requestedChapterId && requestedChapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      effectiveChapterId = req.session.chapterId;
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;

    await syncAutoDependencyKpiCompletions({
      chapterId: effectiveChapterId!,
      year,
      quarter,
    });

    const completions = await storage.getKpiCompletions(effectiveChapterId!, year, quarter);
    res.json(completions);
  });

  app.get("/api/barangay-kpi-completions", requireBarangayAuth, async (req, res) => {
    const chapterId = req.session.chapterId;
    const barangayId = req.session.barangayId;
    if (!chapterId || !barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;

    await syncAutoDependencyKpiCompletionsForBarangay({
      chapterId,
      barangayId,
      year,
      quarter,
    });

    const completions = await storage.getBarangayKpiCompletions(barangayId, year, quarter);
    res.json(completions);
  });

  app.post("/api/barangay-kpi-completions", requireBarangayAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId;
      const barangayId = req.session.barangayId;
      if (!chapterId || !barangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validated = insertKpiCompletionSchema.parse({
        ...req.body,
        chapterId,
        barangayId,
      });

      const template = await storage.getKpiTemplate(validated.kpiTemplateId);
      if (!template) {
        return res.status(404).json({ error: "KPI template not found" });
      }

      const assignedToBarangay = await isTemplateAssignedToBarangay(template.id, chapterId, barangayId);
      if (!assignedToBarangay) {
        return res.status(403).json({ error: "This KPI is not assigned to your barangay." });
      }

      if (isAutoDependencyTemplate(template)) {
        return res.status(400).json({ error: "This KPI is auto-tracked by dependencies and cannot be submitted manually." });
      }

      const existing = await storage.getKpiCompletionByTemplateAndBarangay(validated.kpiTemplateId, barangayId);
      if (existing) {
        const updated = await storage.updateKpiCompletion(existing.id, validated);
        return res.json(updated);
      }

      const completion = await storage.createKpiCompletion(validated);
      return res.json(completion);
    } catch (error: any) {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/barangay-kpi-completions/:id/mark-complete", requireBarangayAuth, async (req, res) => {
    const barangayId = req.session.barangayId;
    if (!barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingCompletion = await storage.getKpiCompletion(req.params.id);
    if (!existingCompletion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }

    if (existingCompletion.barangayId !== barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const template = await storage.getKpiTemplate(existingCompletion.kpiTemplateId);
    if (template && isAutoDependencyTemplate(template)) {
      return res.status(400).json({ error: "This KPI is auto-tracked by dependencies and is completed automatically." });
    }

    const completion = await storage.markKpiCompleted(req.params.id);
    if (!completion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }
    return res.json(completion);
  });

  app.post("/api/kpi-completions", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertKpiCompletionSchema.parse({
        ...req.body,
        chapterId,
        barangayId: null,
      });

      const template = await storage.getKpiTemplate(validated.kpiTemplateId);
      if (!template) {
        return res.status(404).json({ error: "KPI template not found" });
      }

      if (isBarangayOnlyKpiTemplateScope(template)) {
        return res.status(403).json({
          error: "This KPI is assigned to barangays. Chapter is not a recipient of this KPI.",
        });
      }

      if (isAutoDependencyTemplate(template)) {
        return res.status(400).json({ error: "This KPI is auto-tracked by dependencies and cannot be submitted manually." });
      }
      
      const existing = await storage.getKpiCompletionByTemplateAndChapter(validated.kpiTemplateId, chapterId);
      if (existing) {
        const updated = await storage.updateKpiCompletion(existing.id, validated);
        return res.json(updated);
      }
      
      const completion = await storage.createKpiCompletion(validated);
      res.json(completion);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/kpi-completions/:id", requireChapterAuth, async (req, res) => {
    try {
      const existingCompletion = await storage.getKpiCompletion(req.params.id);
      if (!existingCompletion) {
        return res.status(404).json({ error: "KPI completion not found" });
      }

      if (existingCompletion.chapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const template = await storage.getKpiTemplate(existingCompletion.kpiTemplateId);
      if (template && isBarangayOnlyKpiTemplateScope(template)) {
        return res.status(403).json({
          error: "This KPI is assigned to barangays. Chapter is not a recipient of this KPI.",
        });
      }

      if (template && isAutoDependencyTemplate(template)) {
        return res.status(400).json({ error: "This KPI is auto-tracked by dependencies and cannot be edited manually." });
      }

      const validated = insertKpiCompletionSchema.partial().parse(req.body) as Record<string, unknown>;
      delete validated.chapterId;
      delete validated.barangayId;
      delete validated.kpiTemplateId;

      const completion = await storage.updateKpiCompletion(req.params.id, validated as any);
      if (!completion) {
        return res.status(404).json({ error: "KPI completion not found" });
      }
      res.json(completion);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.post("/api/kpi-completions/:id/mark-complete", requireChapterAuth, async (req, res) => {
    const existingCompletion = await storage.getKpiCompletion(req.params.id);
    if (!existingCompletion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }

    if (existingCompletion.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (existingCompletion.barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const template = await storage.getKpiTemplate(existingCompletion.kpiTemplateId);
    if (template && isBarangayOnlyKpiTemplateScope(template)) {
      return res.status(403).json({
        error: "This KPI is assigned to barangays. Chapter is not a recipient of this KPI.",
      });
    }

    if (template && isAutoDependencyTemplate(template)) {
      return res.status(400).json({ error: "This KPI is auto-tracked by dependencies and is completed automatically." });
    }

    const completion = await storage.markKpiCompleted(req.params.id);
    if (!completion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }
    res.json(completion);
  });

  app.delete("/api/kpi-completions/:id", requireChapterAuth, async (req, res) => {
    const existingCompletion = await storage.getKpiCompletion(req.params.id);
    if (!existingCompletion) {
      return res.status(404).json({ error: "KPI completion not found" });
    }

    if (existingCompletion.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteKpiCompletion(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "KPI completion not found" });
    }

    res.json({ success: true });
  });

  app.put("/api/chapters/:id/social-media", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    if (chapterId !== req.params.id) {
      return res.status(403).json({ error: "Cannot update another chapter's social media" });
    }
    
    try {
      const { facebookLink, instagramLink } = req.body;
      const chapter = await storage.updateChapter(req.params.id, { facebookLink, instagramLink });
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }
      res.json(chapter);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/volunteer-opportunities/chapter", requireChapterAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const chapterId = req.session.chapterId!;
      const chapter = await storage.getChapter(chapterId);
      const targetScope = req.body.targetScope === "barangay" ? "barangay" : "chapter";
      let connectedBarangayIds: string[] = [];
      let chapterLabel = chapter?.name || "";

      if (targetScope === "barangay") {
        const requestedBarangayIds = parseBarangayIdsCsv(req.body.barangayIds ?? req.body.barangayId);
        if (requestedBarangayIds.length === 0) {
          return res.status(400).json({ error: "Please select a barangay" });
        }

        const chapterBarangays = await storage.getBarangayUsersByChapterId(chapterId);
        const activeBarangayById = new Map(
          chapterBarangays
            .filter((barangay) => barangay.isActive)
            .map((barangay) => [barangay.id, barangay]),
        );
        const connectedBarangays = requestedBarangayIds.map((barangayId) => activeBarangayById.get(barangayId));
        if (connectedBarangays.some((barangay) => !barangay)) {
          return res.status(400).json({ error: "Invalid barangay selected" });
        }

        connectedBarangayIds = requestedBarangayIds;
        const connectedBarangayNames = connectedBarangays
          .map((barangay) => barangay!.barangayName)
          .filter((name, index, source) => source.indexOf(name) === index);
        chapterLabel = `${chapter?.name || "Chapter"} - ${connectedBarangayNames.join(", ")}`;
      }

      const primaryBarangayId = connectedBarangayIds[0];
      const barangayIdsCsv = connectedBarangayIds.length > 0 ? connectedBarangayIds.join(",") : undefined;

      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] chapter create", {
        route: req.originalUrl,
        chapterId,
        hasFile: Boolean(req.file),
        photoUrl,
      });
      
      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: req.body.eventName,
        date: req.body.date,
        time: req.body.time,
        venue: req.body.venue,
        chapterId,
        barangayId: primaryBarangayId,
        barangayIds: barangayIdsCsv,
        chapter: chapterLabel,
        description: normalizeOptionalText(req.body.description),
        sdgs: normalizeOptionalText(req.body.sdgs) || "",
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail),
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl),
        applyUrl: normalizeOptionalText(req.body.applyUrl),
        deadlineAt: normalizeOptionalText(req.body.deadlineAt),
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || "18+",
        photoUrl
      });
      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] chapter create failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/chapter/:id", requireChapterAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const existing = await storage.getVolunteerOpportunity(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Volunteer opportunity not found" });
      }

      const chapterId = req.session.chapterId!;
      if (existing.chapterId !== chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const chapter = await storage.getChapter(chapterId);
      const requestedScope = typeof req.body.targetScope === "string" ? req.body.targetScope : "";
      const targetScope = requestedScope
        ? (requestedScope === "barangay" ? "barangay" : "chapter")
        : (existing.barangayIds || existing.barangayId ? "barangay" : "chapter");

      let connectedBarangayIds: string[] = [];
      let chapterLabel = chapter?.name || existing.chapter || "Chapter";

      if (targetScope === "barangay") {
        const fallbackBarangayIds = existing.barangayIds || existing.barangayId || "";
        const requestedBarangayIds = parseBarangayIdsCsv(req.body.barangayIds ?? req.body.barangayId ?? fallbackBarangayIds);
        if (requestedBarangayIds.length === 0) {
          return res.status(400).json({ error: "Please select at least one barangay" });
        }

        const chapterBarangays = await storage.getBarangayUsersByChapterId(chapterId);
        const activeBarangayById = new Map(
          chapterBarangays
            .filter((barangay) => barangay.isActive)
            .map((barangay) => [barangay.id, barangay]),
        );
        const connectedBarangays = requestedBarangayIds.map((barangayId) => activeBarangayById.get(barangayId));
        if (connectedBarangays.some((barangay) => !barangay)) {
          return res.status(400).json({ error: "Invalid barangay selected" });
        }

        connectedBarangayIds = requestedBarangayIds;
        const connectedBarangayNames = connectedBarangays
          .map((barangay) => barangay!.barangayName)
          .filter((name, index, source) => source.indexOf(name) === index);
        chapterLabel = `${chapter?.name || "Chapter"} - ${connectedBarangayNames.join(", ")}`;
      }

      const primaryBarangayId = connectedBarangayIds[0];
      const barangayIdsCsv = connectedBarangayIds.length > 0 ? connectedBarangayIds.join(",") : undefined;
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: normalizeOptionalText(req.body.eventName) || existing.eventName,
        date: req.body.date || existing.date,
        time: normalizeOptionalText(req.body.time) || existing.time || "TBD",
        venue: normalizeOptionalText(req.body.venue) || existing.venue || "TBD",
        chapterId,
        barangayId: primaryBarangayId,
        barangayIds: barangayIdsCsv,
        chapter: chapterLabel,
        description: normalizeOptionalText(req.body.description) || existing.description,
        sdgs: normalizeOptionalText(req.body.sdgs) || existing.sdgs || "",
        contactName: normalizeOptionalText(req.body.contactName) || existing.contactName,
        contactPhone: normalizeOptionalText(req.body.contactPhone) || existing.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail) || existing.contactEmail,
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl) || existing.learnMoreUrl,
        applyUrl: normalizeOptionalText(req.body.applyUrl) || existing.applyUrl,
        deadlineAt: normalizeOptionalText(req.body.deadlineAt) || existing.deadlineAt,
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || existing.ageRequirement || "18+",
        photoUrl: photoUrl || existing.photoUrl || undefined,
      });

      const updated = await storage.updateVolunteerOpportunity(req.params.id, validated);
      res.json(updated);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/volunteer-opportunities/chapter/:id", requireChapterAuth, async (req, res) => {
    const existing = await storage.getVolunteerOpportunity(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }

    if (existing.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteVolunteerOpportunity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }

    res.json({ success: true });
  });

  app.get("/api/volunteer-opportunities/by-chapter", requireAuth, async (req, res) => {
    let chapterId = typeof req.query.chapterId === "string" ? req.query.chapterId : "";

    if (req.session.role === "chapter" || req.session.role === "barangay") {
      if (!req.session.chapterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (chapterId && chapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      chapterId = req.session.chapterId;
    }

    if (!chapterId) {
      return res.status(400).json({ error: "chapterId required" });
    }

    const opportunities = await storage.getVolunteerOpportunitiesByChapter(chapterId);
    res.json(opportunities);
  });

  app.get("/api/volunteer-opportunities/by-barangay", requireBarangayAuth, async (req, res) => {
    const barangayId = req.session.barangayId;
    if (!barangayId) {
      return res.status(400).json({ error: "barangayId required" });
    }

    const opportunities = await storage.getVolunteerOpportunitiesByBarangay(barangayId);
    res.json(opportunities);
  });

  app.post("/api/volunteer-opportunities/barangay", requireBarangayAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const chapterId = req.session.chapterId;
      const barangayId = req.session.barangayId;
      if (!chapterId || !barangayId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [chapter, barangay] = await Promise.all([
        storage.getChapter(chapterId),
        storage.getBarangayUser(barangayId),
      ]);

      if (!barangay || barangay.chapterId !== chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const chapterLabel = `${chapter?.name || "Chapter"} - ${barangay.barangayName}`;
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      console.log("[volunteer-image-upload] barangay create", {
        route: req.originalUrl,
        chapterId,
        barangayId,
        hasFile: Boolean(req.file),
        photoUrl,
      });

      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: req.body.eventName,
        date: req.body.date,
        time: req.body.time,
        venue: req.body.venue,
        chapterId,
        barangayId,
        barangayIds: barangayId,
        chapter: chapterLabel,
        description: normalizeOptionalText(req.body.description),
        sdgs: normalizeOptionalText(req.body.sdgs) || "",
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail),
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl),
        applyUrl: normalizeOptionalText(req.body.applyUrl),
        deadlineAt: normalizeOptionalText(req.body.deadlineAt),
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || "18+",
        photoUrl,
      });

      const opportunity = await storage.createVolunteerOpportunity(validated);
      res.json(opportunity);
    } catch (error: any) {
      console.error("[volunteer-image-upload] barangay create failed", {
        route: req.originalUrl,
        message: error?.message,
      });
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.put("/api/volunteer-opportunities/barangay/:id", requireBarangayAuth, volunteerUpload.single("photo"), async (req, res) => {
    try {
      const existing = await storage.getVolunteerOpportunity(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Volunteer opportunity not found" });
      }

      const chapterId = req.session.chapterId;
      const barangayId = req.session.barangayId;
      if (!chapterId || !barangayId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (existing.chapterId !== chapterId || existing.barangayId !== barangayId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const normalizeOptionalText = (value: unknown) => {
        if (typeof value !== "string") {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const [chapter, barangay] = await Promise.all([
        storage.getChapter(chapterId),
        storage.getBarangayUser(barangayId),
      ]);

      const chapterLabel = `${chapter?.name || "Chapter"} - ${barangay?.barangayName || existing.chapter}`;
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

      const validated = insertVolunteerOpportunitySchema.parse({
        eventName: normalizeOptionalText(req.body.eventName) || existing.eventName,
        date: req.body.date || existing.date,
        time: normalizeOptionalText(req.body.time) || existing.time || "TBD",
        venue: normalizeOptionalText(req.body.venue) || existing.venue || "TBD",
        chapterId,
        barangayId,
        barangayIds: barangayId,
        chapter: chapterLabel,
        description: normalizeOptionalText(req.body.description) || existing.description,
        sdgs: normalizeOptionalText(req.body.sdgs) || existing.sdgs || "",
        contactName: normalizeOptionalText(req.body.contactName) || existing.contactName,
        contactPhone: normalizeOptionalText(req.body.contactPhone) || existing.contactPhone,
        contactEmail: normalizeOptionalText(req.body.contactEmail) || existing.contactEmail,
        learnMoreUrl: normalizeOptionalText(req.body.learnMoreUrl) || existing.learnMoreUrl,
        applyUrl: normalizeOptionalText(req.body.applyUrl) || existing.applyUrl,
        deadlineAt: normalizeOptionalText(req.body.deadlineAt) || existing.deadlineAt,
        ageRequirement: normalizeOptionalText(req.body.ageRequirement) || existing.ageRequirement || "18+",
        photoUrl: photoUrl || existing.photoUrl || undefined,
      });

      const updated = await storage.updateVolunteerOpportunity(req.params.id, validated);
      res.json(updated);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.delete("/api/volunteer-opportunities/barangay/:id", requireBarangayAuth, async (req, res) => {
    const existing = await storage.getVolunteerOpportunity(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }

    const chapterId = req.session.chapterId;
    const barangayId = req.session.barangayId;
    if (!chapterId || !barangayId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (existing.chapterId !== chapterId || existing.barangayId !== barangayId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteVolunteerOpportunity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Volunteer opportunity not found" });
    }

    res.json({ success: true });
  });

  app.get("/api/important-documents", requireAuth, async (req, res) => {
    const documents = await storage.getImportantDocuments();
    res.json(documents);
  });

  app.post("/api/important-documents", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertImportantDocumentSchema.parse(req.body);
      const document = await storage.createImportantDocument(validated);
      res.json(document);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/important-documents/:id", requireAdminAuth, async (req, res) => {
    try {
      const document = await storage.updateImportantDocument(req.params.id, req.body);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/important-documents/:id", requireAdminAuth, async (req, res) => {
    const deleted = await storage.deleteImportantDocument(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true });
  });

  app.get("/api/important-documents/acknowledgements", requireAdminAuth, async (req, res) => {
    const acknowledgements = await storage.getImportantDocumentAcknowledgements();
    res.json(acknowledgements);
  });

  app.get("/api/chapter-document-acks", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const acks = await storage.getChapterDocumentAcks(chapterId);
    res.json(acks);
  });

  app.post("/api/chapter-document-acks/:documentId/acknowledge", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const documentId = req.params.documentId;
    const ack = await storage.acknowledgeDocument(chapterId, documentId);
    res.json(ack);
  });

  app.get("/api/mou-submissions", requireAdminAuth, async (req, res) => {
    const submissions = await storage.getMouSubmissions();
    res.json(submissions);
  });

  app.get("/api/mou-submissions/my-submission", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const submission = await storage.getMouSubmissionByChapter(chapterId);
    res.json(submission || null);
  });

  app.post("/api/mou-submissions", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertMouSubmissionSchema.parse({
        ...req.body,
        chapterId,
        driveFolderUrl: "https://drive.google.com/drive/folders/1eAi3sB1KBGZ9nKffbwJbGnaD6N7NIYkY?usp=sharing"
      });
      const submission = await storage.createMouSubmission(validated);
      res.json(submission);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/mou-submissions/:id", requireChapterAuth, async (req, res) => {
    try {
      const existingSubmission = await storage.getMouSubmission(req.params.id);
      if (!existingSubmission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (existingSubmission.chapterId !== req.session.chapterId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validated = insertMouSubmissionSchema.partial().parse(req.body) as Record<string, unknown>;
      delete validated.chapterId;
      delete validated.driveFolderUrl;

      const submission = await storage.updateMouSubmission(req.params.id, validated as any);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/mou-submissions/:id", requireChapterAuth, async (req, res) => {
    const existingSubmission = await storage.getMouSubmission(req.params.id);
    if (!existingSubmission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (existingSubmission.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteMouSubmission(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({ success: true });
  });

  app.get("/api/chapter-requests", requireAdminAuth, async (req, res) => {
    const requests = await storage.getChapterRequests();
    res.json(requests);
  });

  app.get("/api/chapter-requests/my-requests", requireChapterAuth, async (req, res) => {
    const chapterId = req.session.chapterId!;
    const requests = await storage.getChapterRequestsByChapter(chapterId);
    res.json(requests);
  });

  app.post("/api/chapter-requests", requireChapterAuth, async (req, res) => {
    try {
      const chapterId = req.session.chapterId!;
      const validated = insertChapterRequestSchema.parse({
        ...req.body,
        chapterId,
        status: "new"
      });
      const request = await storage.createChapterRequest(validated);
      res.json(request);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/chapter-requests/:id", requireAdminAuth, async (req, res) => {
    try {
      const request = await storage.updateChapterRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/chapter-requests/:id", requireAuth, async (req, res) => {
    const existingRequest = await storage.getChapterRequest(req.params.id);
    if (!existingRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (req.session.role === "chapter" && existingRequest.chapterId !== req.session.chapterId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (req.session.role !== "admin" && req.session.role !== "chapter") {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleted = await storage.deleteChapterRequest(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });
  });

  // National Request routes (messaging system)
  app.get("/api/national-requests", requireAdminAuth, async (req, res) => {
    const requests = await storage.getNationalRequests();
    res.json(requests);
  });

  app.get("/api/national-requests/my-requests", async (req, res) => {
    let senderType: string;
    let senderId: string;
    
    if (req.session.chapterId) {
      senderType = "chapter";
      senderId = req.session.chapterId;
    } else if (req.session.barangayId) {
      senderType = "barangay";
      senderId = req.session.barangayId;
    } else {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const requests = await storage.getNationalRequestsBySender(senderType, senderId);
    res.json(requests);
  });

  app.post("/api/national-requests", async (req, res) => {
    try {
      let senderType: string;
      let senderId: string;
      
      if (req.session.chapterId) {
        senderType = "chapter";
        senderId = req.session.chapterId;
      } else if (req.session.barangayId) {
        senderType = "barangay";
        senderId = req.session.barangayId;
      } else {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validated = insertNationalRequestSchema.parse({
        ...req.body,
        senderType,
        senderId,
        dateNeeded: new Date(req.body.dateNeeded),
        status: "NEW"
      });
      const request = await storage.createNationalRequest(validated);
      res.json(request);
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.message });
    }
  });

  app.patch("/api/national-requests/:id", requireAdminAuth, async (req, res) => {
    try {
      const updateData: any = { ...req.body };
      if (req.body.adminReply) {
        updateData.repliedAt = new Date();
        updateData.processedByAdminId = req.session.userId;
      }
      const request = await storage.updateNationalRequest(req.params.id, updateData);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/national-requests/:id", requireAuth, async (req, res) => {
    const existingRequest = await storage.getNationalRequest(req.params.id);
    if (!existingRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (req.session.role !== "admin") {
      let senderType: string;
      let senderId: string;

      if (req.session.chapterId) {
        senderType = "chapter";
        senderId = req.session.chapterId;
      } else if (req.session.barangayId) {
        senderType = "barangay";
        senderId = req.session.barangayId;
      } else {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (existingRequest.senderType !== senderType || existingRequest.senderId !== senderId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const deleted = await storage.deleteNationalRequest(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });
  });

  if (process.env.DATABASE_URL) {
    void ensureAdminRelationshipTable().catch((error: any) => {
      console.error("[startup] Failed to ensure admin relationship table", {
        message: error?.message,
      });
    });
    void ensureMembersApplicationReferenceInfra().catch((error: any) => {
      console.error("[startup] Failed to ensure members application reference infra", {
        message: error?.message,
      });
    });
    void ensureVolunteerOpportunityInfra().catch((error: any) => {
      console.error("[startup] Failed to ensure volunteer opportunity infra", {
        message: error?.message,
      });
    });
    void ensureBackfilledMemberApplicationReferenceIds().catch((error: any) => {
      console.error("[startup] Failed to backfill member application reference IDs", {
        message: error?.message,
      });
    });
    void initializeDefaultsWithoutBlockingStartup();
  } else if (process.env.NODE_ENV === "development") {
    console.warn(
      "[startup] DATABASE_URL is not set; skipping database initialization in development.",
    );
  } else {
    console.warn("[startup] DATABASE_URL is not set; database-backed routes will be unavailable.");
  }

  const httpServer = createServer(app);

  return httpServer;
}
