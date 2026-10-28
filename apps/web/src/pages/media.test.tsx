// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type MediaItem } from "../api.ts";
import { ToastProvider } from "../components/ui/toast.tsx";
import { MediaPage } from "./media.tsx";

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
  thumbnailUrl: "/api/media/photo/thumbnail",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  owner: null,
  canEdit: true,
  usageCount: 0,
};
const clip: MediaItem = { ...photo, id: "clip", name: "clip.mp4", kind: "video", mime: "video/mp4", thumbnailUrl: null };
const news = { id: "folder-1", name: "News", icon: null, parentId: null, childCount: 0 };

type Sent = { url: string; file: File };
let sent: Sent[] = [];

class FakeRequest {
  url = "";
  status = 0;
  response: unknown = null;
  responseType = "";
  withCredentials = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  send(body: FormData) {
    const file = body.get("file") as File;
    sent.push({ url: this.url, file });
    queueMicrotask(() => {
      this.status = 200;
      this.response = { ...photo, id: `up-${sent.length}`, name: file.name, folderId: new URL(this.url, "http://x").searchParams.get("folder") };
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

function installApi() {
  vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.includes("/api/folders") && path.includes("tree=1")) return { folders: [news] };
    if (path.includes("/api/folders") && path.includes("parent=folder-1")) return { folders: [], breadcrumb: [news] };
    if (path.includes("/api/folders")) return { folders: [news], breadcrumb: [] };
    if (init?.method === "PATCH") return { ok: true };
    if (path.startsWith("/api/media?")) return { media: [photo, clip], total: 2 };
    return {};
  });
}

function filesTransfer(files: File[]) {
  return { files, types: ["Files"], getData: () => "" };
}

function renderPage(path = "/media") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <MediaPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function patchCalls() {
  return vi.mocked(api).mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH");
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("media drag and drop", () => {
  it("uploads files dropped on the page into the open folder and lists them", async () => {
    installApi();
    renderPage();
    const section = (await screen.findByText("harbor.png")).closest("section") as HTMLElement;
    fireEvent.drop(section, { dataTransfer: filesTransfer([new File(["x"], "boat.webp", { type: "image/webp" })]) });
    expect(await screen.findByText("boat.webp")).toBeTruthy();
    expect(sent.map((item) => item.url)).toEqual(["/api/media"]);
  });

  it("uploads files dropped on a folder row or a crumb into that folder", async () => {
    installApi();
    renderPage();
    const folderRow = (await screen.findByText("News")).closest("tr") as HTMLElement;
    fireEvent.drop(folderRow, { dataTransfer: filesTransfer([new File(["x"], "a.png", { type: "image/png" })]) });
    await vi.waitFor(() => expect(sent.map((item) => item.url)).toEqual(["/api/media?folder=folder-1"]));

    cleanup();
    sent = [];
    renderPage("/media?folder=folder-1");
    const root = await screen.findByRole("button", { name: "Media" });
    fireEvent.drop(root, { dataTransfer: filesTransfer([new File(["x"], "b.png", { type: "image/png" })]) });
    await vi.waitFor(() => expect(sent.map((item) => item.url)).toEqual(["/api/media"]));
  });

  it("shows a refused file type as a failed row without uploading it", async () => {
    installApi();
    renderPage();
    const section = (await screen.findByText("harbor.png")).closest("section") as HTMLElement;
    fireEvent.drop(section, { dataTransfer: filesTransfer([new File(["x"], "notes.txt", { type: "text/plain" })]) });
    expect(await screen.findByText("notes.txt")).toBeTruthy();
    expect(screen.getByText("Use a JPEG, PNG, WebP, GIF, SVG, MP4, WebM, or PDF file")).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it("moves a file into a folder and undoes the move", async () => {
    installApi();
    renderPage();
    const folderRow = (await screen.findByText("News")).closest("tr") as HTMLElement;
    fireEvent.drop(folderRow, { dataTransfer: { files: [], types: ["text/plain"], getData: () => "media:photo" } });
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/media/photo",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: "folder-1" }) }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/media/photo",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: null }) }),
      ),
    );
  });

  it("moves a whole selection dragged together out of a folder", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.includes("tree=1")) return { folders: [news] };
      if (path.includes("/api/folders")) return { folders: [], breadcrumb: [news] };
      if (init?.method === "PATCH") return { ok: true };
      if (path.startsWith("/api/media?")) {
        return { media: [{ ...photo, folderId: "folder-1" }, { ...clip, folderId: "folder-1" }], total: 2 };
      }
      return {};
    });
    renderPage("/media?folder=folder-1");
    const root = await screen.findByRole("button", { name: "Media" });
    await screen.findByText("clip.mp4");
    fireEvent.drop(root, { dataTransfer: { files: [], types: ["text/plain"], getData: () => "media:photo,media:clip" } });
    await vi.waitFor(() => expect(patchCalls().map(([path]) => path).sort()).toEqual(["/api/media/clip", "/api/media/photo"]));
    for (const [, init] of patchCalls()) {
      expect((init as { body: string }).body).toBe(JSON.stringify({ folderId: null }));
    }
  });
});
