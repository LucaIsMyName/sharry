import { useRouteLoaderData } from "react-router";

export const DEFAULT_APP_NAME = "Sharry";

export function useAppName(): string {
  const data = useRouteLoaderData("root") as { appName?: string } | undefined;
  const name = data?.appName?.trim();
  return name || DEFAULT_APP_NAME;
}
