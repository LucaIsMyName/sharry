import type { QrStyle, UtmParams } from "@sharry/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.error ?? "Request failed",
      payload.code,
    );
  return payload as T;
}

export type Scope = "full" | "password_change" | "mfa_enroll" | "mfa_challenge";

export type Me = {
  user: {
    id: string;
    username: string;
    email: string;
    role: "admin" | "user";
    totpEnabled: boolean;
    mustChangePassword: boolean;
    hasAvatar: boolean;
    updatedAt: string;
  };
  scope: Scope;
  mfaRequired: boolean;
  mailConfigured: boolean;
};

export type ShortLink = {
  id: string;
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  description: string | null;
  redirectType: "301" | "302" | "307" | "308";
  status: "active" | "disabled";
  expiresAt: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  utm: UtmParams;
  userId: string;
  redirectDomainId: string | null;
};

export type LinkSummary = ShortLink & { clicks: number };

export type PublicSettings = {
  appName: string;
  shortUrlPrefix: string;
  shortUrlBase: string;
  appUrl: string;
  defaultRedirectType: ShortLink["redirectType"];
  slugLength: number;
  defaultQrStyle: QrStyle;
};

export type LinkStat = {
  id: string;
  slug: string;
  title: string | null;
  clicks: number;
  uniqueVisitors: number;
};

export type Analytics = {
  totalClicks: number;
  uniqueVisitors: number;
  botClicks: number;
  series: { date: string; clicks: number }[];
  referrers: { name: string; clicks: number }[];
  countries: { name: string; clicks: number }[];
  browsers: { name: string; clicks: number }[];
  operatingSystems: { name: string; clicks: number }[];
  devices: { name: string; clicks: number }[];
  utmSources: { name: string; clicks: number }[];
  utmMediums: { name: string; clicks: number }[];
  utmCampaigns: { name: string; clicks: number }[];
  utmIds: { name: string; clicks: number }[];
  utmTerms: { name: string; clicks: number }[];
  utmContents: { name: string; clicks: number }[];
  campaigns: { name: string; clicks: number }[];
  qrCodes: { id: string; name: string; clicks: number }[];
};

export type QrCode = {
  id: string;
  linkId: string;
  trackingVariantId: string | null;
  name: string;
  style: QrStyle;
  hasLogo: boolean;
  createdAt: string;
  url: string;
  warnings: string[];
};
