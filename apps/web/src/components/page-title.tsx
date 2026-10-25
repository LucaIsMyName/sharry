import { Helmet } from "react-helmet-async";
import { useMatches } from "react-router";
import { useI18n } from "../i18n/index.tsx";

export function DocumentHead() {
  const { t } = useI18n();
  const matches = useMatches();
  const title = routeTitle(matches);
  return (
    <Helmet titleTemplate="%s · Sharry" defaultTitle="Sharry">
      {title ? <title>{t(title)}</title> : null}
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}

export function PageTitle({
  title,
  literal = false,
}: {
  title: string;
  literal?: boolean;
}) {
  const { t } = useI18n();
  const text = literal ? title : t(title);
  return (
    <Helmet>
      <title>{`${text} · Sharry`}</title>
    </Helmet>
  );
}

function routeTitle(matches: ReturnType<typeof useMatches>): string | null {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle as { title?: unknown } | undefined;
    if (typeof handle?.title === "string" && handle.title) return handle.title;
  }
  return null;
}
