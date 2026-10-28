import type { Locale, PageContent, PageMediaRef, PageSettings, QrStyle, RoutingChoices, RoutingRule, UtmParams, UtmPresets } from "@sharry/shared";

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
    locale: Locale;
    hasAvatar: boolean;
    updatedAt: string;
  };
  scope: Scope;
  mfaRequired: boolean;
  mailConfigured: boolean;
};

export type LinkPerson = {
  username: string;
  role: "admin" | "user";
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
  routingRules: RoutingRule[];
  routingChoices?: RoutingChoices;
  userId: string;
  redirectDomainId: string | null;
  canEdit?: boolean;
  owner?: LinkPerson | null;
  updatedBy?: LinkPerson | null;
  icon?: string | null;
  folderId?: string | null;
  tags?: { id: string; name: string; color: string }[];
  folderPath?: { id: string; name: string }[];
};

export type LinkSummary = ShortLink & { clicks: number };

export type PublicSettings = {
  appName: string;
  shortUrlPrefix: string;
  pagePrefix: string;
  shortUrlBase: string;
  appUrl: string;
  defaultRedirectType: ShortLink["redirectType"];
  slugLength: number;
  defaultQrStyle: QrStyle;
  utmPresets?: UtmPresets;
};

export type LinkStat = {
  id: string;
  slug: string;
  title: string | null;
  clicks: number;
  uniqueVisitors: number;
};

export type AnalyticsOptions = {
  countries: string[];
  browsers: string[];
  operatingSystems: string[];
  utmSources: string[];
  utmMediums: string[];
  utmCampaigns: string[];
  utmIds: string[];
  utmTerms: string[];
  utmContents: string[];
  referrers?: string[];
  devices?: string[];
};

export type Analytics = {
  totalClicks: number;
  uniqueVisitors: number;
  botClicks: number;
  series: { date: string; clicks: number }[];
  options?: AnalyticsOptions;
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
  earliestCreatedAt?: string;
};

export type QrCode = {
  id: string;
  linkId: string;
  trackingVariantId: string | null;
  name: string;
  style: QrStyle;
  hasLogo: boolean;
  logoMediaId: string | null;
  logoUrl: string | null;
  createdAt: string;
  url: string;
  warnings: string[];
};

export type MediaKind = "image" | "video" | "document";

export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  title: string | null;
  folderId: string | null;
  userId: string;
  path: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: LinkPerson | null;
  canEdit?: boolean;
  usageCount?: number;
};

export type PageStatus = "draft" | "published" | "changed" | "hidden";

export type LandingPageSummary = {
  id: string;
  title: string;
  slug: string;
  url: string;
  status: PageStatus;
  hidden: boolean;
  publishedAt: string | null;
  folderId: string | null;
  redirectDomainId: string | null;
  userId: string;
  owner: LinkPerson | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LandingPage = LandingPageSummary & {
  content: PageContent;
  settings: PageSettings;
  media: Record<string, PageMediaRef>;
};

export type MediaUsage = {
  qrCodes: { id: string; name: string; linkId: string; linkSlug: string }[];
  pages: { id: string; title: string; slug: string }[];
};
