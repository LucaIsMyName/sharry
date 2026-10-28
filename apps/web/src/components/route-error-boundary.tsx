import { Component, type ReactNode } from "react";
import { useI18n } from "../i18n/index.tsx";
import { Button, buttonVariants } from "./ui/button.tsx";

const pageMessage = "This page could not be shown.";

type BoundaryProps = {
  children: ReactNode;
  resetKey: string;
  message?: string;
};

type BoundaryState = {
  error: Error | null;
  resetKey: string;
};

export class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Pick<BoundaryState, "error"> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return state.error ? { error: null, resetKey: props.resetKey } : { resetKey: props.resetKey };
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <RouteErrorFallback message={this.props.message ?? pageMessage} onRetry={this.retry} />;
  }
}

function RouteErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid justify-items-start gap-3 py-10" role="alert">
      <p className="text-base text-muted-foreground md:text-sm">{t(message)}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t("Try again")}
      </Button>
    </div>
  );
}

export function RootRouteError() {
  return (
    <main className="grid min-h-svh content-center px-6 py-16">
      <div className="mx-auto grid w-full max-w-md gap-3">
        <h1 className="text-lg font-medium">This page could not be shown.</h1>
        <p className="text-sm text-muted-foreground">Reload the page, or go back to the overview.</p>
        <a className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })} href="/">
          Overview
        </a>
      </div>
    </main>
  );
}
