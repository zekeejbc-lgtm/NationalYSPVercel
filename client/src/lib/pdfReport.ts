import { formatManilaDateTime12h, ORGANIZATION_REPORT_INFO, PDF_THEME } from "@/lib/export/pdfStandards";

type PdfTextTone = "normal" | "muted" | "accent";

type PdfTableCellAlign = "left" | "center" | "right";

type PdfTableColumn = {
  header: string;
  key: string;
  width?: number;
  align?: PdfTableCellAlign;
};

type PdfTableRow = Record<string, string | number | boolean | null | undefined>;

type CreateYspPdfReportOptions = {
  reportTitle: string;
  reportSubtitle?: string;
  exportedAt?: string;
};

type YspPdfReportBuilder = {
  addSectionTitle: (title: string) => void;
  addTextBlock: (text: string, tone?: PdfTextTone, size?: number) => void;
  addMetricRow: (label: string, value: string) => void;
  addTable: (
    columns: PdfTableColumn[],
    rows: PdfTableRow[],
    options?: { emptyMessage?: string }
  ) => void;
  addSpacer: (height?: number) => void;
  save: (fileName: string) => void;
};

async function getLogoDataUrl() {
  const logoCandidates = [
    ORGANIZATION_REPORT_INFO.logoPath,
    "/images/ysp-logo.png",
    "images/ysp-logo.png",
  ];

  const blobToDataUrl = async (blob: Blob) =>
    await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

  for (const candidate of logoCandidates) {
    try {
      const response = await fetch(candidate, { cache: "no-store" });
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) continue;

      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl) return dataUrl;
    } catch {
      // Try fallback candidate.
    }
  }

  const loadImageToDataUrl = async (src: string) =>
    await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || 96;
        canvas.height = image.naturalHeight || 96;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(null);
      image.src = `${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`;
    });

  for (const candidate of logoCandidates) {
    const dataUrl = await loadImageToDataUrl(candidate);
    if (dataUrl) return dataUrl;
  }

  return null;
}

export async function createYspPdfReport(options: CreateYspPdfReportOptions): Promise<YspPdfReportBuilder> {
  const { jsPDF } = await import("jspdf");
  const logoDataUrl = await getLogoDataUrl();
  const exportedAt = options.exportedAt || `${formatManilaDateTime12h(new Date())} (Asia/Manila)`;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  const headerBottomY = 126;
  const footerStartY = pageHeight - 70;
  const footerDividerY = footerStartY - 12;
  const contentBottomY = footerDividerY - 12;
  const contentStartY = headerBottomY + 20;
  let cursorY = contentStartY;

  const drawHeader = (pageNumber = 1) => {
    let titleStartX = marginX;

    doc.setDrawColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
    doc.setLineWidth(1.2);
    doc.line(marginX, 18, pageWidth - marginX, 18);

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", marginX, 24, 48, 48);
      titleStartX = marginX + 60;
    } else {
      doc.setDrawColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.setLineWidth(0.8);
      doc.roundedRect(marginX, 24, 48, 48, 6, 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.text("YSP", marginX + 24, 53, { align: "center" });
      titleStartX = marginX + 60;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
    doc.text(ORGANIZATION_REPORT_INFO.name, titleStartX, 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
    doc.text(ORGANIZATION_REPORT_INFO.fullGovernmentName, titleStartX, 50);
    doc.text(ORGANIZATION_REPORT_INFO.motto, titleStartX, 64);
    doc.text(`SEC Registry No.: ${ORGANIZATION_REPORT_INFO.secRegistryNumber}`, titleStartX, 78);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
    doc.text(`Exported: ${exportedAt}`, pageWidth - marginX, 30, { align: "right" });

    doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
    doc.setLineWidth(0.8);
    doc.line(marginX, 90, pageWidth - marginX, 90);

    if (pageNumber === 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.text(options.reportTitle, marginX, 111);

      if (options.reportSubtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
        doc.text(options.reportSubtitle, marginX, 124);
      }

      doc.setLineWidth(0.7);
      doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
      doc.line(marginX, 130, pageWidth - marginX, 130);
    }
  };

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight > contentBottomY) {
      doc.addPage();
      drawHeader(doc.getNumberOfPages());
      cursorY = contentStartY;
    }
  };

  const drawFooterIconWithText = (
    x: number,
    y: number,
    kind: "facebook" | "website" | "email",
    text: string,
  ) => {
    const iconCenterX = x + 4;
    const iconCenterY = y - 3;

    doc.setDrawColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
    doc.setLineWidth(0.7);
    doc.circle(iconCenterX, iconCenterY, 4);

    doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
    if (kind === "website") {
      doc.setLineWidth(0.5);
      doc.line(iconCenterX - 2.3, iconCenterY, iconCenterX + 2.3, iconCenterY);
      doc.ellipse(iconCenterX, iconCenterY - 1.4, 2.2, 0.9);
      doc.ellipse(iconCenterX, iconCenterY + 1.4, 2.2, 0.9);
      doc.ellipse(iconCenterX, iconCenterY, 1.0, 2.9);
      doc.ellipse(iconCenterX, iconCenterY, 2.0, 2.9);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(kind === "facebook" ? "f" : "@", iconCenterX, y - 1, { align: "center" });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
    doc.text(text, x + 12, y);
  };

  const finalizePages = () => {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
      doc.setLineWidth(0.8);
      doc.line(marginX, footerDividerY, pageWidth - marginX, footerDividerY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.text(ORGANIZATION_REPORT_INFO.fullGovernmentName, marginX, footerStartY - 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
      doc.text(`SEC Registry No.: ${ORGANIZATION_REPORT_INFO.secRegistryNumber}`, marginX, footerStartY + 6);

      drawFooterIconWithText(marginX, footerStartY + 18, "facebook", ORGANIZATION_REPORT_INFO.facebook);
      drawFooterIconWithText(marginX + 165, footerStartY + 18, "website", ORGANIZATION_REPORT_INFO.website);
      drawFooterIconWithText(marginX + 305, footerStartY + 18, "email", ORGANIZATION_REPORT_INFO.email);

      doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, footerStartY + 32, { align: "right" });
    }
  };

  drawHeader(1);

  return {
    addSectionTitle: (title: string) => {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(PDF_THEME.accent[0], PDF_THEME.accent[1], PDF_THEME.accent[2]);
      doc.text(title, marginX, cursorY);

      doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
      doc.setLineWidth(0.7);
      doc.line(marginX, cursorY + 8, pageWidth - marginX, cursorY + 8);
      cursorY += 24;
    },
    addTextBlock: (text, tone = "normal", size = 10) => {
      const lines = doc.splitTextToSize(text, contentWidth) as string[];
      const textHeight = Math.max(lines.length * 13 + 3, 16);
      ensureSpace(textHeight);

      const color = tone === "accent"
        ? PDF_THEME.accent
        : tone === "muted"
          ? PDF_THEME.mutedText
          : PDF_THEME.text;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(lines, marginX, cursorY);
      cursorY += textHeight;
    },
    addMetricRow: (label, value) => {
      ensureSpace(22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(PDF_THEME.text[0], PDF_THEME.text[1], PDF_THEME.text[2]);
      doc.text(label, marginX, cursorY);

      doc.setFont("helvetica", "normal");
      doc.text(value, pageWidth - marginX, cursorY, { align: "right" });

      doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
      doc.setLineWidth(0.5);
      doc.line(marginX, cursorY + 7, pageWidth - marginX, cursorY + 7);
      cursorY += 18;
    },
    addTable: (columns, rows, options) => {
      if (columns.length === 0) {
        return;
      }

      if (rows.length === 0) {
        const emptyMessage = options?.emptyMessage || "No rows available.";
        const tableHeight = 30;
        ensureSpace(tableHeight);
        doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
        doc.rect(marginX, cursorY, contentWidth, tableHeight);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(PDF_THEME.mutedText[0], PDF_THEME.mutedText[1], PDF_THEME.mutedText[2]);
        doc.text(emptyMessage, marginX + 8, cursorY + 18);
        cursorY += tableHeight + 10;
        return;
      }

      const totalWeight = columns.reduce((sum, column) => sum + (column.width || 1), 0);
      const columnWidths = columns.map((column) => (contentWidth * (column.width || 1)) / totalWeight);
      const tableFontSize = 8.5;
      const tableLineHeight = tableFontSize * 1.2;
      const cellPaddingX = 4;
      const cellPaddingY = 4;
      const tableHeaderHeight = 22;

      const drawTableHeader = () => {
        ensureSpace(tableHeaderHeight + tableLineHeight + 10);

        doc.setFillColor(PDF_THEME.tableHeaderFill[0], PDF_THEME.tableHeaderFill[1], PDF_THEME.tableHeaderFill[2]);
        doc.rect(marginX, cursorY, contentWidth, tableHeaderHeight, "F");

        let columnX = marginX;
        columns.forEach((column, columnIndex) => {
          const cellWidth = columnWidths[columnIndex];
          doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
          doc.rect(columnX, cursorY, cellWidth, tableHeaderHeight);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(PDF_THEME.text[0], PDF_THEME.text[1], PDF_THEME.text[2]);
          const headerLines = doc.splitTextToSize(column.header, cellWidth - cellPaddingX * 2) as string[];
          doc.text(headerLines, columnX + cellPaddingX, cursorY + 14, {
            maxWidth: cellWidth - cellPaddingX * 2,
          });

          columnX += cellWidth;
        });

        cursorY += tableHeaderHeight;
      };

      drawTableHeader();

      rows.forEach((row, rowIndex) => {
        const rowLineSets = columns.map((column, columnIndex) => {
          const cellWidth = columnWidths[columnIndex];
          const rawValue = row[column.key];
          const cellText = rawValue === null || rawValue === undefined || rawValue === "" ? "-" : String(rawValue);
          return doc.splitTextToSize(cellText, cellWidth - cellPaddingX * 2) as string[];
        });

        const maxLines = rowLineSets.reduce((max, lines) => Math.max(max, lines.length), 1);
        const rowHeight = Math.max(maxLines * tableLineHeight + cellPaddingY * 2, 20);

        if (cursorY + rowHeight > contentBottomY) {
          doc.addPage();
          drawHeader(doc.getNumberOfPages());
          cursorY = contentStartY;
          drawTableHeader();
        }

        if (rowIndex % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(marginX, cursorY, contentWidth, rowHeight, "F");
        }

        let columnX = marginX;
        columns.forEach((column, columnIndex) => {
          const cellWidth = columnWidths[columnIndex];
          const lines = rowLineSets[columnIndex];

          doc.setDrawColor(PDF_THEME.border[0], PDF_THEME.border[1], PDF_THEME.border[2]);
          doc.rect(columnX, cursorY, cellWidth, rowHeight);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(tableFontSize);
          doc.setTextColor(PDF_THEME.text[0], PDF_THEME.text[1], PDF_THEME.text[2]);

          const textY = cursorY + cellPaddingY + tableFontSize;
          const alignment = column.align || "left";

          if (alignment === "right") {
            doc.text(lines, columnX + cellWidth - cellPaddingX, textY, {
              align: "right",
              lineHeightFactor: 1.2,
              maxWidth: cellWidth - cellPaddingX * 2,
            });
          } else if (alignment === "center") {
            doc.text(lines, columnX + cellWidth / 2, textY, {
              align: "center",
              lineHeightFactor: 1.2,
              maxWidth: cellWidth - cellPaddingX * 2,
            });
          } else {
            doc.text(lines, columnX + cellPaddingX, textY, {
              lineHeightFactor: 1.2,
              maxWidth: cellWidth - cellPaddingX * 2,
            });
          }

          columnX += cellWidth;
        });

        cursorY += rowHeight;
      });

      cursorY += 10;
    },
    addSpacer: (height = 10) => {
      ensureSpace(height);
      cursorY += height;
    },
    save: (fileName) => {
      finalizePages();
      doc.save(fileName);
    },
  };
}

export type { PdfTableColumn, PdfTableRow };