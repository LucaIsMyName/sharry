const pageWidth = 595;
const pageHeight = 842;
const margin = 48;
const contentWidth = pageWidth - margin * 2;

export const analyticsPdfFilename = "sharry-analytics.pdf";

export type AnalyticsPdfReport = {
  summary: string;
  clicksLabel: string;
  sections: {
    title: string;
    series?: { date: string; clicks: number }[];
    rows?: { name: string; clicks: number }[];
  }[];
};

const winAnsiExtras: Record<string, number> = {
  "\u20ac": 0x80,
  "\u201a": 0x82,
  "\u201e": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201c": 0x93,
  "\u201d": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u2122": 0x99,
};

function winAnsiByte(char: string): number {
  const extra = winAnsiExtras[char];
  if (extra != null) return extra;
  const code = char.codePointAt(0) ?? 63;
  if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) return code;
  return 63;
}

function pdfText(value: string): string {
  let out = "";
  for (const char of value) {
    const code = winAnsiByte(char);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(code);
  }
  return out;
}

function plainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function wrap(value: string, size: number): string[] {
  const max = Math.max(16, Math.floor(contentWidth / (size * 0.52)));
  const lines: string[] = [];
  for (const paragraph of value.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function clip(value: string, max: number): string {
  const chars = [...value];
  if (chars.length <= max) return value;
  return `${chars.slice(0, max - 1).join("")}…`;
}

class PdfLayout {
  private pages: string[][] = [];
  private top = margin;

  constructor() {
    this.newPage();
  }

  private commands(): string[] {
    return this.pages[this.pages.length - 1] ?? [];
  }

  private newPage() {
    this.pages.push([]);
    this.top = margin;
    this.commands().push("0.23 0.45 0.78 rg", `0 ${pageHeight - 16} ${pageWidth} 16 re f`);
  }

  private room(height: number) {
    if (this.top + height <= pageHeight - margin) return;
    this.newPage();
  }

  title(value: string) {
    this.room(36);
    this.commands().push(`BT /F2 20 Tf 0 0 0 rg 1 0 0 1 ${margin} ${pageHeight - this.top - 20} Tm (${pdfText(value)}) Tj ET`);
    this.top += 32;
  }

  paragraph(value: string, size = 11) {
    for (const line of wrap(plainText(value), size)) {
      this.room(size + 6);
      this.commands().push(`BT /F1 ${size} Tf 0.15 0.15 0.18 rg 1 0 0 1 ${margin} ${pageHeight - this.top - size} Tm (${pdfText(line)}) Tj ET`);
      this.top += size + 5;
    }
    this.top += 8;
  }

  heading(value: string) {
    this.room(28);
    this.top += 6;
    this.commands().push(`BT /F2 13 Tf 0.12 0.16 0.28 rg 1 0 0 1 ${margin} ${pageHeight - this.top - 13} Tm (${pdfText(value)}) Tj ET`);
    this.top += 18;
    this.commands().push("0.23 0.45 0.78 rg", `${margin} ${pageHeight - this.top} 36 2 re f`);
    this.top += 10;
  }

  series(points: { date: string; clicks: number }[], clicksLabel: string) {
    if (points.length === 0) return;
    const total = points.reduce((sum, point) => sum + point.clicks, 0);
    this.paragraph(`${points[0]?.date ?? ""} – ${points[points.length - 1]?.date ?? ""} · ${total} ${clicksLabel}`, 10);
    const height = 88;
    this.room(height + 8);
    const bottom = pageHeight - this.top - height;
    const max = Math.max(1, ...points.map((point) => point.clicks));
    const gap = points.length > 80 ? 0 : 1;
    const barWidth = Math.max(1, (contentWidth - gap * Math.max(0, points.length - 1)) / points.length);
    this.commands().push("0.93 0.94 0.96 rg", `${margin} ${bottom} ${contentWidth} ${height} re f`);
    this.commands().push("0.23 0.45 0.78 rg");
    points.forEach((point, index) => {
      const barHeight = Math.max(point.clicks > 0 ? 2 : 0, (point.clicks / max) * (height - 8));
      const x = margin + index * (barWidth + gap);
      this.commands().push(`${x.toFixed(2)} ${(bottom + 4).toFixed(2)} ${Math.max(0.6, barWidth - 0.4).toFixed(2)} ${barHeight.toFixed(2)} re f`);
    });
    this.top += height + 12;
  }

  rows(rows: { name: string; clicks: number }[]) {
    const max = Math.max(1, ...rows.map((row) => row.clicks));
    for (const row of rows) {
      this.room(18);
      const y = pageHeight - this.top - 12;
      const barWidth = Math.max(2, (row.clicks / max) * 250);
      this.commands().push(`BT /F1 10 Tf 0.15 0.15 0.18 rg 1 0 0 1 ${margin} ${y} Tm (${pdfText(clip(row.name, 28))}) Tj ET`);
      this.commands().push("0.93 0.94 0.96 rg", `${margin + 150} ${y - 2} 250 8 re f`);
      this.commands().push("0.23 0.45 0.78 rg", `${margin + 150} ${y - 2} ${barWidth.toFixed(2)} 8 re f`);
      this.commands().push(`BT /F1 10 Tf 0.15 0.15 0.18 rg 1 0 0 1 ${margin + 408} ${y} Tm (${pdfText(String(row.clicks))}) Tj ET`);
      this.top += 16;
    }
    this.top += 6;
  }

  bytes(): Uint8Array {
    const fontRegular = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    const fontBold = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    const objects = ["", "", fontRegular, fontBold];
    const pageIds: number[] = [];
    for (const commands of this.pages) {
      const stream = commands.join("\n");
      const contentId = objects.length + 1;
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = objects.length + 1;
      pageIds.push(pageId);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
    }
    const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
    objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`;
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(body.length);
      body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xref = body.length;
    body += `xref\n0 ${objects.length + 1}\n`;
    body += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index += 1) {
      body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(body.length);
    for (let index = 0; index < body.length; index += 1) bytes[index] = body.charCodeAt(index);
    return bytes;
  }
}

export function analyticsPdfBytes(report: AnalyticsPdfReport): Uint8Array {
  const layout = new PdfLayout();
  layout.title("Sharry analytics");
  if (report.summary.trim()) layout.paragraph(report.summary);
  for (const section of report.sections) {
    if (section.series && section.series.length > 0) {
      layout.heading(section.title);
      layout.series(section.series, report.clicksLabel);
    }
    if (section.rows && section.rows.length > 0) {
      layout.heading(section.title);
      layout.rows(section.rows);
    }
  }
  return layout.bytes();
}

export function downloadAnalyticsPdf(report: AnalyticsPdfReport): void {
  const bytes = analyticsPdfBytes(report);
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = analyticsPdfFilename;
  link.click();
  URL.revokeObjectURL(url);
}
