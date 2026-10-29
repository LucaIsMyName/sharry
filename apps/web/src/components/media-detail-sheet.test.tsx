// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { MediaItem } from "../api.ts";
import { ToastProvider } from "./ui/toast.tsx";
import { MediaDetailSheet, clampMediaSheetWidth, loadMediaSheetWidth, mediaSheetMaxWidth } from "./media-detail-sheet.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
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
  canEdit: true,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function renderSheet() {
  apiMock.mockResolvedValue({ ...photo, usage: { qrCodes: [], pages: [] } });
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MediaDetailSheet mediaId="photo" initial={photo} onOpenChange={() => {}} onSaved={() => {}} onDelete={() => {}} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function sheetWidth(): string {
  return (document.querySelector("[data-slot=sheet-content]") as HTMLElement).style.width;
}

describe("media detail sheet width", () => {
  it("starts at the saved width and grows toward the left edge", () => {
    localStorage.setItem("sharry.media-sheet-width", "700");
    renderSheet();
    const handle = screen.getByRole("separator", { name: "Resize the file details" });
    expect(handle.getAttribute("aria-valuenow")).toBe("700");
    expect(handle.getAttribute("aria-valuemax")).toBe(String(mediaSheetMaxWidth));
    expect(sheetWidth()).toBe("700px");

    fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window);
    expect(sheetWidth()).toBe("800px");
    expect(localStorage.getItem("sharry.media-sheet-width")).toBe("800");
  });

  it("stops at 960 pixels and at 320 pixels", () => {
    renderSheet();
    const handle = screen.getByRole("separator", { name: "Resize the file details" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000 });
    fireEvent.pointerMove(window, { clientX: 0 });
    fireEvent.pointerUp(window);
    expect(sheetWidth()).toBe("960px");
    expect(localStorage.getItem("sharry.media-sheet-width")).toBe("960");

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 900 });
    fireEvent.pointerUp(window);
    expect(sheetWidth()).toBe("320px");
    expect(handle.getAttribute("aria-valuemin")).toBe("320");
  });

  it("rejects a stored width outside the range", () => {
    localStorage.setItem("sharry.media-sheet-width", "2000");
    expect(loadMediaSheetWidth()).toBe(960);
    localStorage.setItem("sharry.media-sheet-width", "nope");
    expect(loadMediaSheetWidth()).toBe(448);
    expect(clampMediaSheetWidth(100)).toBe(320);
  });

  it("changes the width from the keyboard", () => {
    renderSheet();
    const handle = screen.getByRole("separator", { name: "Resize the file details" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(sheetWidth()).toBe("464px");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(sheetWidth()).toBe("448px");
    expect(localStorage.getItem("sharry.media-sheet-width")).toBe("448");
  });
});
