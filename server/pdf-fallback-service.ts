import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { PdfExportContract } from "@shared/pdf-export-contract";

export type PdfFallbackAuditStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed"
  | "rejected";

type PdfFallbackMetadata = {
  id: string;
  receivedAt: string;
  reportId: string;
  purpose: string;
  actorRole: string;
  chapterId?: string;
  barangayId?: string;
  source: "ui" | "api";
  generationMode: "client" | "server" | "hybrid";
  status: PdfFallbackAuditStatus;
  reason: string;
  requestIp: string;
  userAgent: string;
  renderedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  outputFileName?: string;
  outputFileSizeBytes?: number;
};

export type PdfFallbackAuditEntry = PdfFallbackMetadata;

export type PdfFallbackInternalEntry = PdfFallbackMetadata & {
  contract: PdfExportContract | null;
  outputAbsolutePath?: string;
};

type RegisterAcceptedPdfFallbackInput = {
  contract: PdfExportContract;
  actorRole: string;
  reason: string;
  requestIp: string;
  userAgent: string;
};

type RegisterRejectedPdfFallbackInput = {
  reportId: string;
  purpose: string;
  actorRole: string;
  chapterId?: string;
  barangayId?: string;
  source: "ui" | "api";
  generationMode: "client" | "server" | "hybrid";
  reason: string;
  requestIp: string;
  userAgent: string;
};

const PDF_FALLBACK_AUDIT_MAX_ENTRIES = 250;
const FALLBACK_OUTPUT_DIR = path.resolve(process.cwd(), "tmp", "pdf-fallback");

const pdfFallbackAuditEntries: PdfFallbackInternalEntry[] = [];
const pendingQueue: string[] = [];
let isWorkerRunning = false;

function createSafeFileToken(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function toPublicEntry(entry: PdfFallbackInternalEntry): PdfFallbackAuditEntry {
  const { contract: _contract, outputAbsolutePath: _outputAbsolutePath, ...publicEntry } = entry;
  return publicEntry;
}

function dropOldestEntriesIfNeeded() {
  while (pdfFallbackAuditEntries.length > PDF_FALLBACK_AUDIT_MAX_ENTRIES) {
    const removed = pdfFallbackAuditEntries.shift();
    if (removed?.outputAbsolutePath && fs.existsSync(removed.outputAbsolutePath)) {
      void fsp.unlink(removed.outputAbsolutePath).catch(() => {
        // Best effort cleanup.
      });
    }
  }
}

function appendInternalEntry(entry: PdfFallbackInternalEntry) {
  pdfFallbackAuditEntries.push(entry);
  dropOldestEntriesIfNeeded();
}

function queueRender(fallbackId: string) {
  pendingQueue.push(fallbackId);
  void runQueueWorker();
}

async function runQueueWorker() {
  if (isWorkerRunning) {
    return;
  }

  isWorkerRunning = true;
  try {
    while (pendingQueue.length > 0) {
      const nextId = pendingQueue.shift();
      if (!nextId) {
        continue;
      }

      const entry = pdfFallbackAuditEntries.find((item) => item.id === nextId);
      if (!entry || entry.status === "rejected") {
        continue;
      }

      await renderFallbackPdf(entry);
    }
  } finally {
    isWorkerRunning = false;
  }
}

function buildFileName(entry: PdfFallbackInternalEntry) {
  const prefix = createSafeFileToken(entry.contract?.filenamePolicy.prefix || entry.reportId, "ysp-report");
  const chapterToken = entry.contract?.filenamePolicy.includeChapterToken !== false
    ? createSafeFileToken(entry.chapterId, "chapter")
    : "";

  const includeYear = entry.contract?.filenamePolicy.includeYear !== false;
  const includeQuarter = Boolean(entry.contract?.filenamePolicy.includeQuarter);
  const yearValue = includeYear
    ? typeof entry.contract?.filters.year === "number" || typeof entry.contract?.filters.year === "string"
      ? String(entry.contract?.filters.year)
      : ""
    : "";

  const quarterValue = includeQuarter
    ? typeof entry.contract?.filters.quarter === "number" || typeof entry.contract?.filters.quarter === "string"
      ? String(entry.contract?.filters.quarter)
      : ""
    : "";

  const dateStamp = new Date().toISOString().slice(0, 10);
  const idToken = entry.id.slice(-6);
  const pieces = [prefix, chapterToken, yearValue, quarterValue ? `q${quarterValue}` : "", dateStamp, idToken]
    .filter(Boolean)
    .map((piece) => createSafeFileToken(piece, "token"));

  return `${pieces.join("-")}.pdf`;
}

function createPdfBuffer(entry: PdfFallbackInternalEntry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!entry.contract) {
      reject(new Error("Missing contract for fallback render"));
      return;
    }

    const contract = entry.contract;
    const pageFormat = contract.layoutProfile.format === "letter" ? "LETTER" : "A4";
    const orientation = contract.layoutProfile.orientation === "landscape" ? "landscape" : "portrait";
    const margin = Math.max(24, Math.min(72, Math.round(contract.layoutProfile.marginX || 40)));

    const doc = new PDFDocument({
      size: pageFormat,
      layout: orientation,
      margin,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("error", reject);
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    const selectedSections = Object.entries(contract.selectedSections)
      .filter(([, enabled]) => enabled)
      .map(([section]) => section);

    const selectedColumns = Object.entries(contract.selectedColumns)
      .filter(([, enabled]) => enabled)
      .map(([column]) => column);

    const filterPairs = Object.entries(contract.filters).filter(([, value]) => value !== undefined);

    doc.fontSize(18).fillColor("#f97316").text(contract.brandingProfile.organizationName);
    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text(contract.brandingProfile.legalName)
      .text(`SEC Registry No.: ${contract.brandingProfile.secRegistryNumber}`)
      .text(`Generated by server fallback: ${new Date().toISOString()}`)
      .moveDown(1);

    doc.fontSize(16).fillColor("#111827").text(contract.title);
    if (contract.subtitle) {
      doc.fontSize(11).fillColor("#4b5563").text(contract.subtitle);
    }

    doc
      .moveDown(0.5)
      .fontSize(10)
      .fillColor("#111827")
      .text(`Report ID: ${contract.reportId}`)
      .text(`Purpose: ${contract.purpose}`)
      .text(`Requested By: ${entry.actorRole}`)
      .text(`Source Mode: ${contract.generationMode}`)
      .text(`Client Failure Reason: ${entry.reason}`)
      .moveDown(1);

    doc.fontSize(12).fillColor("#f97316").text("Selected Sections");
    if (selectedSections.length === 0) {
      doc.fontSize(10).fillColor("#6b7280").text("- None");
    } else {
      selectedSections.forEach((section) => {
        doc.fontSize(10).fillColor("#111827").text(`- ${section}`);
      });
    }

    doc.moveDown(0.6).fontSize(12).fillColor("#f97316").text("Selected Columns");
    if (selectedColumns.length === 0) {
      doc.fontSize(10).fillColor("#6b7280").text("- None");
    } else {
      selectedColumns.forEach((column) => {
        doc.fontSize(10).fillColor("#111827").text(`- ${column}`);
      });
    }

    doc.moveDown(0.6).fontSize(12).fillColor("#f97316").text("Filters");
    if (filterPairs.length === 0) {
      doc.fontSize(10).fillColor("#6b7280").text("- None");
    } else {
      filterPairs.forEach(([key, value]) => {
        doc.fontSize(10).fillColor("#111827").text(`- ${key}: ${String(value)}`);
      });
    }

    doc
      .moveDown(1)
      .fontSize(9)
      .fillColor("#6b7280")
      .text(
        "This PDF was generated via backend fallback after a client-side export failure. " +
          "It captures the validated export contract and request metadata for recovery and audit.",
      );

    doc.end();
  });
}

async function renderFallbackPdf(entry: PdfFallbackInternalEntry) {
  entry.status = "rendering";

  try {
    await fsp.mkdir(FALLBACK_OUTPUT_DIR, { recursive: true });

    const outputFileName = buildFileName(entry);
    const outputAbsolutePath = path.join(FALLBACK_OUTPUT_DIR, outputFileName);
    const pdfBuffer = await createPdfBuffer(entry);

    await fsp.writeFile(outputAbsolutePath, pdfBuffer);

    entry.status = "completed";
    entry.renderedAt = new Date().toISOString();
    entry.outputFileName = outputFileName;
    entry.outputFileSizeBytes = pdfBuffer.byteLength;
    entry.outputAbsolutePath = outputAbsolutePath;
    entry.errorMessage = undefined;
  } catch (error: unknown) {
    entry.status = "failed";
    entry.failedAt = new Date().toISOString();
    entry.errorMessage = error instanceof Error ? error.message : "Unknown render error";
  }
}

export function createPdfFallbackAuditId() {
  return `pdf-fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerAcceptedPdfFallback(input: RegisterAcceptedPdfFallbackInput): PdfFallbackAuditEntry {
  const id = createPdfFallbackAuditId();
  const entry: PdfFallbackInternalEntry = {
    id,
    receivedAt: new Date().toISOString(),
    reportId: input.contract.reportId,
    purpose: input.contract.purpose,
    actorRole: input.actorRole || input.contract.snapshotMetadata.actorRole || "unknown",
    chapterId: input.contract.snapshotMetadata.chapterId,
    barangayId: input.contract.snapshotMetadata.barangayId,
    source: input.contract.snapshotMetadata.source,
    generationMode: input.contract.generationMode,
    status: "queued",
    reason: input.reason,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
    contract: input.contract,
  };

  appendInternalEntry(entry);
  queueRender(id);
  return toPublicEntry(entry);
}

export function registerRejectedPdfFallback(input: RegisterRejectedPdfFallbackInput): PdfFallbackAuditEntry {
  const entry: PdfFallbackInternalEntry = {
    id: createPdfFallbackAuditId(),
    receivedAt: new Date().toISOString(),
    reportId: input.reportId,
    purpose: input.purpose,
    actorRole: input.actorRole,
    chapterId: input.chapterId,
    barangayId: input.barangayId,
    source: input.source,
    generationMode: input.generationMode,
    status: "rejected",
    reason: input.reason,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
    contract: null,
  };

  appendInternalEntry(entry);
  return toPublicEntry(entry);
}

export function listPdfFallbackAuditEntries(): PdfFallbackAuditEntry[] {
  return pdfFallbackAuditEntries.map(toPublicEntry);
}

export function getPdfFallbackAuditEntryById(fallbackId: string): PdfFallbackAuditEntry | undefined {
  const entry = pdfFallbackAuditEntries.find((item) => item.id === fallbackId);
  return entry ? toPublicEntry(entry) : undefined;
}

export function getPdfFallbackInternalEntryById(fallbackId: string): PdfFallbackInternalEntry | undefined {
  return pdfFallbackAuditEntries.find((item) => item.id === fallbackId);
}
