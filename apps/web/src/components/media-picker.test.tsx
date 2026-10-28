// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rasterImageMimes } from "@sharry/shared";
import { api, type MediaItem } from "../api.ts";
import { MediaPicker } from "./media-picker.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const photo: MediaItem = {
  id: "photo",
  name: "harbor.png",
  kind: "image",
  mime: "image/png",
  size: 2048,
  width: 400,
  height: 300,
  alt: null,
  title: null,
  folderId: null,
  userId: "user",
  path: "/files/photo/harbor.png",
  url: "https://s.example/files/photo/harbor.png",
  thumbnailUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  owner: null,
  canEdit: true,
  usageCount: 0,
};
const brochure: MediaItem = { ...photo, id: "brochure", name: "brochure.pdf", kind: "document", mime: "application/pdf" };

let uploads: string[] = [];

class FakeRequest {
  url = "";
  status = 0;
  response: unknown = null;
  responseType = "";
  withCredentials = false;
  upload = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  send(body: FormData) {
    const file = body.get("file") as File;
    uploads.push(file.name);
    queueMicrotask(() => {
      this.status = 200;
      this.response = { ...photo, id: "fresh", name: file.name };
      this.onload?.();
    });
  }
  abort() {}
}

function renderPicker(onPick = vi.fn(), onOpenChange = vi.fn()) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path.includes("/api/folders")) return { folders: [], breadcrumb: [] };
    return { media: [photo, brochure], total: 2 };
  });
  render(
    <MediaPicker open onOpenChange={onOpenChange} accept={rasterImageMimes} acceptLabel="PNG, JPEG, or WebP" onPick={onPick} />,
  );
  return { onPick, onOpenChange };
}

beforeEach(() => {
  uploads = [];
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("media picker", () => {
  it("lists only usable files and returns the clicked one", async () => {
    const { onPick, onOpenChange } = renderPicker();
    fireEvent.click(await screen.findByText("harbor.png"));
    expect(screen.queryByText("brochure.pdf")).toBeNull();
    expect(onPick).toHaveBeenCalledWith(photo);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uploads a dropped file and picks it right away", async () => {
    const { onPick } = renderPicker();
    await screen.findByText("harbor.png");
    fireEvent.drop(screen.getByTestId("media-picker-drop"), {
      dataTransfer: { files: [new File(["x"], "logo.png", { type: "image/png" })], types: ["Files"] },
    });
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "fresh", name: "logo.png" })));
    expect(uploads).toEqual(["logo.png"]);
  });

  it("refuses a dropped file of the wrong type", async () => {
    const { onPick } = renderPicker();
    await screen.findByText("harbor.png");
    fireEvent.drop(screen.getByTestId("media-picker-drop"), {
      dataTransfer: { files: [new File(["x"], "manual.pdf", { type: "application/pdf" })], types: ["Files"] },
    });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Use one of these file types: PNG, JPEG, or WebP");
    expect(uploads).toEqual([]);
    expect(onPick).not.toHaveBeenCalled();
  });
});
