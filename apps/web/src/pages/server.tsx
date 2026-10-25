import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../api.ts";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { useI18n } from "../i18n/index.tsx";

type Usage = { totalBytes: number; availableBytes: number; usedBytes: number };

type SystemSnapshot = {
  collectedAt: string;
  memory: Usage & { processRssBytes: number };
  storage: Usage & { databaseBytes: number };
  os: {
    platform: string;
    type: string;
    release: string;
    arch: string;
    hostname: string;
  };
  cpu: { cores: number; loadAverage: [number, number, number] };
  uptime: { systemSeconds: number; processSeconds: number };
  runtime: {
    packageName: string;
    packageVersion: string;
    nodeVersion: string;
    postgresVersion: string;
  };
};

export function ServerPage() {
  const { t, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [pending, setPending] = useState(true);

  async function load() {
    setPending(true);
    try {
      setSnapshot(await api<SystemSnapshot>("/api/admin/system"));
    } catch (caught) {
      toastCaught(caught, t("Could not load the server"));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            {t("Server")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {snapshot
              ? t("Updated {time}.", {
                  time: new Date(snapshot.collectedAt).toLocaleString(locale),
                })
              : t("Memory, disk, and the installed runtime on this host.")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void load()}
        >
          <RefreshCw />{" "}
          {pending && !snapshot
            ? t("Loading…")
            : pending
              ? t("Refreshing…")
              : t("Refresh")}
        </Button>
      </div>
      {!snapshot && pending ? (
        <p className="text-sm text-muted-foreground">{t("Loading server status…")}</p>
      ) : null}
      {snapshot ? <SnapshotView snapshot={snapshot} /> : null}
    </section>
  );
}

function SnapshotView({ snapshot }: { snapshot: SystemSnapshot }) {
  const { t } = useI18n();
  const load = snapshot.cpu.loadAverage
    .map((value) => value.toFixed(2))
    .join(" · ");
  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label={t("RAM used")}
          bytes={snapshot.memory.usedBytes}
          total={snapshot.memory.totalBytes}
        />
        <Summary
          label={t("RAM available")}
          bytes={snapshot.memory.availableBytes}
          total={snapshot.memory.totalBytes}
        />
        <Summary
          label={t("Storage used")}
          bytes={snapshot.storage.usedBytes}
          total={snapshot.storage.totalBytes}
        />
        <Summary
          label={t("Storage available")}
          bytes={snapshot.storage.availableBytes}
          total={snapshot.storage.totalBytes}
        />
      </div>
      <Card>
        <CardContent className="grid gap-3">
          <h2 className="text-lg font-medium">{t("Memory")}</h2>
          <Meter
            used={snapshot.memory.usedBytes}
            total={snapshot.memory.totalBytes}
          />
          <Facts
            rows={[
              [t("Total"), formatBytes(snapshot.memory.totalBytes)],
              [t("Used"), formatBytes(snapshot.memory.usedBytes)],
              [t("Available"), formatBytes(snapshot.memory.availableBytes)],
              [t("This process"), formatBytes(snapshot.memory.processRssBytes)],
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3">
          <h2 className="text-lg font-medium">{t("Storage")}</h2>
          <Meter
            used={snapshot.storage.usedBytes}
            total={snapshot.storage.totalBytes}
          />
          <Facts
            rows={[
              [t("Total"), formatBytes(snapshot.storage.totalBytes)],
              [t("Used"), formatBytes(snapshot.storage.usedBytes)],
              [t("Available"), formatBytes(snapshot.storage.availableBytes)],
              [t("Database"), formatBytes(snapshot.storage.databaseBytes)],
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3">
          <h2 className="text-lg font-medium">{t("Runtime")}</h2>
          <Facts
            rows={[
              [
                t("Operating system"),
                `${snapshot.os.type} ${snapshot.os.release}`,
              ],
              [t("Platform"), snapshot.os.platform],
              [t("Architecture"), snapshot.os.arch],
              [t("Hostname"), snapshot.os.hostname],
              [
                t("Package"),
                `${snapshot.runtime.packageName} ${snapshot.runtime.packageVersion}`,
              ],
              [t("Node"), snapshot.runtime.nodeVersion],
              [t("PostgreSQL"), snapshot.runtime.postgresVersion],
              [t("CPU"), t("{count} cores", { count: snapshot.cpu.cores })],
              [t("Load average (1, 5, 15 min)"), load],
              [t("System uptime"), formatDuration(snapshot.uptime.systemSeconds)],
              [
                t("Process uptime"),
                formatDuration(snapshot.uptime.processSeconds),
              ],
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Summary({
  label,
  bytes,
  total,
}: {
  label: string;
  bytes: number;
  total: number;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent>
        <span className="text-sm text-muted-foreground">{t(label)}</span>
        <b className="mt-1 block text-3xl tabular-nums">{formatBytes(bytes)}</b>
        <span className="text-sm text-muted-foreground">
          {t("{percent} of {total}", {
            percent: percent(bytes, total),
            total: formatBytes(total),
          })}
        </span>
      </CardContent>
    </Card>
  );
}

function Meter({ used, total }: { used: number; total: number }) {
  const width = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      <div className="h-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function percent(used: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((used / total) * 100)}%`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${whole}s`;
}
