import { useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_TYPE_MESSAGE, mediaAccept } from "@sharry/shared";
import type { MediaItem } from "../api.ts";
import { t } from "../i18n/index.tsx";

const parallelUploads = 3;
const acceptedTypes = new Set(mediaAccept.split(","));

export type UploadEntry = {
  id: string;
  name: string;
  size: number;
  folderId: string | null;
  progress: number;
  status: "queued" | "uploading" | "failed";
  error?: string;
};

type Pending = { entry: UploadEntry; file: File };

/** fetch cannot report upload progress, so uploads use XMLHttpRequest. */
export function uploadMediaFile(
  file: File,
  folderId: string | null,
  onProgress: (fraction: number) => void,
): { promise: Promise<MediaItem>; abort: () => void } {
  const request = new XMLHttpRequest();
  const promise = new Promise<MediaItem>((resolve, reject) => {
    const body = new FormData();
    body.set("file", file);
    request.open("POST", `/api/media${folderId ? `?folder=${encodeURIComponent(folderId)}` : ""}`);
    request.withCredentials = true;
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const payload = (request.response ?? {}) as MediaItem & { error?: string };
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(payload.error ?? "Upload failed"));
    };
    request.onerror = () => reject(new Error("Upload failed"));
    request.onabort = () => reject(new Error("Upload canceled"));
    request.send(body);
  });
  return { promise, abort: () => request.abort() };
}

export function rejectedType(file: File): boolean {
  return file.type !== "" && !acceptedTypes.has(file.type);
}

export function draggedFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types ?? []).includes("Files"));
}

/** Upload files at most three at a time. Each file shows as a row until it finishes or fails. */
export function useMediaUploads(onUploaded: (media: MediaItem) => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const pending = useRef<Pending[]>([]);
  const active = useRef(0);
  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;
  const aborts = useRef(new Map<string, () => void>());

  const patch = useCallback((id: string, next: Partial<UploadEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)));
  }, []);

  const pump = useCallback(() => {
    while (active.current < parallelUploads && pending.current.length > 0) {
      const next = pending.current.shift();
      if (!next) break;
      active.current += 1;
      patch(next.entry.id, { status: "uploading" });
      const upload = uploadMediaFile(next.file, next.entry.folderId, (fraction) =>
        patch(next.entry.id, { progress: fraction }),
      );
      aborts.current.set(next.entry.id, upload.abort);
      upload.promise
        .then((media) => {
          setEntries((current) => current.filter((entry) => entry.id !== next.entry.id));
          uploaded.current(media);
        })
        .catch((caught: unknown) => {
          patch(next.entry.id, {
            status: "failed",
            error: t(caught instanceof Error ? caught.message : "Upload failed"),
          });
        })
        .finally(() => {
          aborts.current.delete(next.entry.id);
          active.current -= 1;
          pump();
        });
    }
  }, [patch]);

  const enqueue = useCallback(
    (files: File[], folderId: string | null) => {
      const added: UploadEntry[] = [];
      for (const file of files) {
        const entry: UploadEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          folderId,
          progress: 0,
          status: "queued",
        };
        if (rejectedType(file)) {
          added.push({ ...entry, status: "failed", error: t(MEDIA_TYPE_MESSAGE) });
          continue;
        }
        added.push(entry);
        pending.current.push({ entry, file });
      }
      setEntries((current) => [...added, ...current]);
      pump();
    },
    [pump],
  );

  const dismiss = useCallback((id: string) => {
    aborts.current.get(id)?.();
    pending.current = pending.current.filter((item) => item.entry.id !== id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  useEffect(() => {
    const running = aborts.current;
    return () => {
      for (const abort of running.values()) abort();
    };
  }, []);

  return { entries, enqueue, dismiss };
}
