import { describe, expect, it } from "vitest";
import { analyticsPdfBytes, analyticsPdfFilename } from "./analytics-pdf.ts";

describe("analytics pdf", () => {
  it("writes the report text and the charts into a pdf", () => {
    const bytes = analyticsPdfBytes({
      summary: "From 2026-10-01 to 2026-10-02: 4 Klicks für den Bericht.",
      clicksLabel: "Clicks",
      sections: [
        { title: "Clicks", series: [{ date: "2026-10-01", clicks: 4 }] },
        { title: "Browsers", rows: [{ name: "Chrome", clicks: 4 }] },
      ],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("Sharry analytics");
    expect(text).toContain("From 2026-10-01 to 2026-10-02");
    expect(text).toContain("Browsers");
    expect(text).toContain("Chrome");
    expect(text).toContain("\\374");
    expect(analyticsPdfFilename).toBe("sharry-analytics.pdf");
  });
});
