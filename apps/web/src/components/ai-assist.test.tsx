// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutingRule, UtmParams } from "@sharry/shared";
import { api } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { AnalyticsSummary } from "./analytics-summary.tsx";
import { BulkLinks } from "./bulk-links.tsx";
import { RouteSuggest } from "./route-suggest.tsx";
import { UtmSuggest } from "./utm-suggest.tsx";
import { VariantDrafts } from "./variant-drafts.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.clearAllMocks();
});

function UtmHarness() {
  const [utm, setUtm] = useState<UtmParams>({ utm_id: "keep" });
  return (
    <div>
      <UtmSuggest
        aiAvailable
        destinationUrl="https://example.com/pricing"
        onApply={(next) => setUtm((current) => ({ ...current, ...next }))}
      />
      <output>{JSON.stringify(utm)}</output>
    </div>
  );
}

describe("AI assists", () => {
  it("hides UTM suggestion when AI is off and fills source, medium, and campaign when it is on", async () => {
    const { rerender } = render(<UtmSuggest aiAvailable={false} destinationUrl="https://example.com" onApply={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Suggest UTM" })).toBeNull();
    rerender(<UtmHarness />);
    expect(screen.getByRole("button", { name: "Suggest UTM" }).hasAttribute("disabled")).toBe(false);
    vi.mocked(api).mockResolvedValue({ utm: { utm_source: "newsletter", utm_medium: "email", utm_campaign: "october" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Where will you share this?" }), {
      target: { value: "October newsletter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest UTM" }));
    expect(await screen.findByText("Suggested from the page.")).toBeTruthy();
    expect(screen.getByText('{"utm_id":"keep","utm_source":"newsletter","utm_medium":"email","utm_campaign":"october"}')).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-utm", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://example.com/pricing", placement: "October newsletter" }),
    });
  });

  it("appends drafted routes and does not save them", async () => {
    const drafted: RoutingRule = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Germany",
      destinationUrl: "https://example.com/de",
      conditions: [{ field: "country", operator: "is", values: ["DE"] }],
    };
    const onAppend = vi.fn();
    vi.mocked(api).mockResolvedValue({ rules: [drafted] });
    render(<RouteSuggest onAppend={onAppend} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe who should go where" }), {
      target: { value: "Germany goes to https://example.com/de" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft routes" }));
    expect(await screen.findByDisplayValue("")).toBeTruthy();
    expect(onAppend).toHaveBeenCalledWith([drafted]);
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Drafted routes are not saved until you save the link.")).toBeTruthy();
  });

  it("summarizes the selected range", async () => {
    vi.mocked(api).mockResolvedValue({ summary: "From 2026-10-01 to 2026-10-20: 0 clicks and 0 unique visitors." });
    render(
      <AnalyticsSummary
        range={{ from: "2026-10-01", to: "2026-10-20" }}
        earliest="2026-10-01"
        onRange={() => undefined}
      />,
    );
    expect(screen.getByRole("slider", { name: "Start date" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));
    expect(await screen.findByText("From 2026-10-01 to 2026-10-20: 0 clicks and 0 unique visitors.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/summarize-analytics", {
      method: "POST",
      body: JSON.stringify({ from: "2026-10-01", to: "2026-10-20" }),
    });
  });

  it("drafts variants into the form and adds them only when asked", async () => {
    const onUse = vi.fn();
    const onDescription = vi.fn();
    const onSaved = vi.fn();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/api/ai/suggest-variants") {
        return {
          description: "Launch copies.",
          variants: [{ name: "Newsletter", utm: { utm_source: "newsletter", utm_medium: "email" } }],
        };
      }
      return {};
    });
    render(
      <VariantDrafts
        campaignId="campaign-1"
        linkId="link-1"
        description=""
        onDescription={onDescription}
        onUse={onUse}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Describe the variants" }), {
      target: { value: "newsletter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft variants" }));
    expect(await screen.findByText("Newsletter")).toBeTruthy();
    expect(onDescription).toHaveBeenCalledWith("Launch copies.");
    expect(screen.getByText("Save the campaign to keep the description.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(onUse).toHaveBeenCalledWith({ name: "Newsletter", utm: { utm_source: "newsletter", utm_medium: "email" } });
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Add these variants" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith("/api/campaigns/campaign-1/variants", {
      method: "POST",
      body: JSON.stringify({ name: "Newsletter", linkId: "link-1", utm: { utm_source: "newsletter", utm_medium: "email" } }),
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("reviews pasted URLs and creates only the kept rows", async () => {
    const onCreated = vi.fn();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/api/ai/suggest-links") {
        return {
          rows: [
            { destinationUrl: "https://example.com/pricing", title: "October pricing", slug: "october-pricing" },
            { destinationUrl: "https://example.com/guide", title: "Pricing guide", slug: "pricing-guide" },
          ],
        };
      }
      return { id: "link" };
    });
    render(<BulkLinks onCreated={onCreated} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Destinations" }), {
      target: { value: "https://example.com/pricing\nhttps://example.com/guide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByDisplayValue("October pricing")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep https://example.com/guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Create links" }));
    expect(await screen.findByText("Created 1 links.")).toBeTruthy();
    expect(onCreated).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith("/api/links", {
      method: "POST",
      body: JSON.stringify({
        destinationUrl: "https://example.com/pricing",
        title: "October pricing",
        slug: "october-pricing",
      }),
    });
    expect(vi.mocked(api).mock.calls.filter((call) => call[0] === "/api/links")).toHaveLength(1);
  });
});
