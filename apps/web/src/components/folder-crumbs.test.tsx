// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FolderCrumbs } from "./folder-crumbs.tsx";

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe("folder crumbs", () => {
  it("omits the root label while the list is at the root", () => {
    render(
      <FolderCrumbs rootLabel="Pages" folder="root" breadcrumb={[]} onOpen={noop} onDrop={noop} />,
    );
    expect(screen.queryByRole("navigation", { name: "Folder" })).toBeNull();
  });

  it("keeps the root once a folder is open", () => {
    render(
      <FolderCrumbs
        rootLabel="Pages"
        folder="folder-1"
        breadcrumb={[{ id: "folder-1", name: "Summer" }]}
        onOpen={noop}
        onDrop={noop}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Folder" });
    expect(nav.textContent).toContain("Pages");
    expect(nav.textContent).toContain("Summer");
  });
});
