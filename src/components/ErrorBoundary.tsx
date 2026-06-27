import * as React from "react";
import { captureException } from "@/lib/analytics";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/** Catches render-time crashes, reports them to analytics, and shows a friendly reload. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center bg-background px-lg py-3xl">
        <div
          role="alert"
          className="max-w-[420px] rounded-lg border border-border bg-surface p-xl text-center shadow-medium"
        >
          <p className="font-display text-xl font-bold text-text">Something went wrong</p>
          <p className="mt-sm text-base text-text-muted">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-lg inline-flex min-h-[40px] items-center justify-center rounded-pill bg-[image:var(--brand-gradient)] px-lg font-semibold text-on-brand shadow-subtle transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
