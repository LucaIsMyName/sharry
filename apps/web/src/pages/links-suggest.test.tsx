// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveLocale } from "../i18n/index.tsx";
import { api } from "../api.ts";
import { LinkSuggestFields } from "./links.tsx";

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

const linkId = "11111111-1111-4111-8111-111111111111";

function Harness({ aiAvailable }: { aiAvailable: boolean }) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("Old");
  return (
    <LinkSuggestFields
      aiAvailable={aiAvailable}
      linkId={linkId}
      destinationUrl={destinationUrl}
      slug={slug}
      title={title}
      onDestination={setDestinationUrl}
      onSlug={setSlug}
      onTitle={setTitle}
    />
  );
}

describe("link editor suggestions", () => {
  it("hides both buttons when AI is off", () => {
    render(<Harness aiAvailable={false} />);
    expect(screen.queryByRole("button", { name: "Suggest a slug" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest a title" })).toBeNull();
  });

  it("writes the suggested slug or title after a destination is typed", async () => {
    vi.mocked(api).mockResolvedValue({
      slug: "pricing-ipstack",
      title: "Pricing | ipstack",
      fromTitle: true,
    });
    render(<Harness aiAvailable />);
    const slugButton = screen.getByRole("button", { name: "Suggest a slug" });
    const titleButton = screen.getByRole("button", { name: "Suggest a title" });
    expect(slugButton.hasAttribute("disabled")).toBe(true);
    expect(titleButton.hasAttribute("disabled")).toBe(true);
    expect(slugButton.parentElement).toBe(screen.getByRole("textbox", { name: "Slug" }).parentElement);
    expect(titleButton.parentElement).toBe(screen.getByRole("textbox", { name: "Title" }).parentElement);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), { target: { value: "https://" } });
    expect(slugButton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://ipstack.com/pricing/" },
    });
    expect(slugButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(slugButton);
    expect(await screen.findByDisplayValue("pricing-ipstack")).toBeTruthy();
    expect(screen.getByDisplayValue("Old")).toBeTruthy();
    expect(screen.getByText("Suggested from the page title.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-slug", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://ipstack.com/pricing/", linkId }),
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), { target: { value: "mine" } });
    expect(screen.queryByText("Suggested from the page title.")).toBeNull();
    fireEvent.click(titleButton);
    expect(await screen.findByDisplayValue("Pricing | ipstack")).toBeTruthy();
    expect(screen.getByDisplayValue("mine")).toBeTruthy();
    expect(screen.getByText("Suggested from the page title.")).toBeTruthy();
  });

  it("suggests from a new link once the destination is a URL", async () => {
    vi.mocked(api).mockResolvedValue({
      slug: "example-domain",
      title: "Example Domain",
      fromTitle: true,
    });
    function NewLinkFields() {
      const [destinationUrl, setDestinationUrl] = useState("https://");
      const [slug, setSlug] = useState("");
      const [title, setTitle] = useState("");
      return (
        <LinkSuggestFields
          aiAvailable
          titleFirst
          slugLabel="Custom slug"
          destinationUrl={destinationUrl}
          slug={slug}
          title={title}
          onDestination={setDestinationUrl}
          onSlug={setSlug}
          onTitle={setTitle}
        />
      );
    }
    render(<NewLinkFields />);
    const slugButton = screen.getByRole("button", { name: "Suggest a slug" });
    const titleBox = screen.getByRole("textbox", { name: "Title" });
    const slugBox = screen.getByRole("textbox", { name: "Custom slug" });
    expect(slugButton.hasAttribute("disabled")).toBe(true);
    expect(titleBox.compareDocumentPosition(slugBox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://example.org" },
    });
    expect(slugButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(slugButton);
    expect(await screen.findByDisplayValue("example-domain")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-slug", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://example.org" }),
    });
  });
});
