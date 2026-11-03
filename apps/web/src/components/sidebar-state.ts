export const SIDEBAR_STORAGE_KEY = "sidebar";

export function readSidebarOpen(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  return storage.getItem(SIDEBAR_STORAGE_KEY) !== "closed";
}

export function writeSidebarOpen(open: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(SIDEBAR_STORAGE_KEY, open ? "open" : "closed");
}
