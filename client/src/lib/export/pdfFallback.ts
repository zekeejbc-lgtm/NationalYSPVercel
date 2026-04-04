import type { PdfExportContract } from "@shared/pdf-export-contract";
import { apiRequest } from "@/lib/queryClient";

function stringifyErrorReason(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown export error";
  }
}

export async function reportPdfFallbackRequest(contract: PdfExportContract, error: unknown) {
  try {
    await apiRequest("POST", "/api/pdf-exports/fallback", {
      contract,
      reason: stringifyErrorReason(error).slice(0, 600),
    });
    return true;
  } catch (fallbackError) {
    console.error("Failed to submit PDF fallback request", fallbackError);
    return false;
  }
}
