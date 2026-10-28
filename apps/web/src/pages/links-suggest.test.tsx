// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { api } from "../api.ts";
import { LinkFormPage, LinkSuggestFields } from "./links.tsx";

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
    expect(await screen.findByText("Suggested from the page title.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-slug", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://ipstack.com/pricing/", linkId }),
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), { target: { value: "mine" } });
    expect(screen.queryByText("Suggested from the page title.")).toBeNull();
    fireEvent.click(titleButton);
    expect(await screen.findByDisplayValue("Pricing | ipstack")).toBeTruthy();
    expect(screen.getByDisplayValue("mine")).toBeTruthy();
    expect(await screen.findByText("Suggested from the page title.")).toBeTruthy();
  });

  it("shows a failed slug suggestion in the field tooltip", async () => {
    vi.mocked(api).mockResolvedValue({ slug: null, title: "Example", fromTitle: false });
    render(<Harness aiAvailable />);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest a slug" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Could not suggest a slug for that page.");
    expect(document.body.querySelector("p")?.textContent ?? "").not.toContain("Could not suggest a slug for that page.");
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), { target: { value: "mine" } });
    expect(screen.queryByRole("tooltip")).toBeNull();
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

  it("uses the heading as the title and puts the destination above the short link", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/settings/public") return { defaultRedirectType: "302" };
      if (path.startsWith("/api/folders")) return { folders: [] };
      if (path === "/api/ai/status") return { available: false };
      return {};
    });
    render(
      <MemoryRouter>
        <LinkFormPage />
      </MemoryRouter>,
    );
    const title = screen.getByRole("textbox", { name: "Title" });
    const destination = screen.getByRole("textbox", { name: "Destination" });
    const slug = screen.getByRole("textbox", { name: "Slug" });
    expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Choose icon" }).className).toContain("size-11");
    expect(title.compareDocumentPosition(destination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(destination.compareDocumentPosition(slug) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "New link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest a title" })).toBeNull();
    fireEvent.change(title, { target: { value: "Launch" } });
    expect(screen.getByDisplayValue("Launch")).toBe(title);
  });

  it("suggests a title from the sparkle beside the heading when AI is on", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/settings/public") return { defaultRedirectType: "302", shortUrlBase: "http://127.0.0.1:3000" };
      if (path.startsWith("/api/folders")) return { folders: [] };
      if (path === "/api/redirect-domains") return { domains: [] };
      if (path === "/api/ai/status") return { available: true };
      if (path === "/api/ai/suggest-slug") {
        return { slug: "example-domain", title: "Example Domain", fromTitle: true };
      }
      return {};
    });
    render(
      <MemoryRouter>
        <LinkFormPage />
      </MemoryRouter>,
    );
    const title = screen.getByRole("textbox", { name: "Title" });
    const button = await screen.findByRole("button", { name: "Suggest a title" });
    expect(title.parentElement?.contains(button)).toBe(true);
    expect(button.className).not.toContain("absolute");
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://example.org" },
    });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(await screen.findByDisplayValue("Example Domain")).toBe(title);
    expect(await screen.findByText("Suggested from the page title.")).toBeTruthy();
  });
});
