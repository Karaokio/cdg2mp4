import * as React from "react";
import { Button, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatLeft } from "@/lib/format";
import { counts, batchEtaSeconds, type QueueItem, type QueueState } from "@/lib/queue";
import {
  cancelItem,
  cancelAll,
  retryItem,
  resetQueue,
  setSaveTarget,
  getSaveTarget,
} from "@/lib/batchRunner";
import { supportsDirectorySave, pickDirectoryTarget } from "@/lib/saveTarget";

function phaseBadge(item: QueueItem): { text: string; tone: "muted" | "brand" | "error" } {
  switch (item.state.phase) {
    case "queued":
      return { text: "Queued", tone: "muted" };
    case "converting": {
      const pct = Math.round(item.state.progress * 100);
      const left = item.state.eta > 0 ? ` · ${formatLeft(item.state.eta)}` : "";
      return { text: `Converting · ${pct}%${left}`, tone: "brand" };
    }
    case "done":
      return {
        text: item.state.savedVia === "directory" ? "Saved to folder" : "Saved",
        tone: "muted",
      };
    case "failed":
      return { text: `Failed · ${item.state.message}`, tone: "error" };
    case "cancelled":
      return { text: "Cancelled", tone: "muted" };
    case "skipped":
      return { text: "Skipped · already converted this session", tone: "muted" };
  }
}

function RowAction({ item }: { item: QueueItem }) {
  switch (item.state.phase) {
    case "queued":
      return (
        <Button variant="secondary" type="button" onClick={() => cancelItem(item.id)}>
          Remove
        </Button>
      );
    case "converting":
      return (
        <Button variant="secondary" type="button" onClick={() => cancelItem(item.id)}>
          Skip
        </Button>
      );
    case "failed":
    case "cancelled":
      return (
        <Button variant="secondary" type="button" onClick={() => retryItem(item.id)}>
          Retry
        </Button>
      );
    case "skipped":
      return (
        <Button variant="secondary" type="button" onClick={() => retryItem(item.id)}>
          Convert anyway
        </Button>
      );
    case "done":
      return null;
  }
}

export function QueueList({ state }: { state: QueueState }) {
  const c = counts(state);
  const finishedCount = c.done + c.failed + c.cancelled + c.skipped;
  const inFlight = c.queued + c.converting;
  const eta = batchEtaSeconds(state);
  const saveKind = getSaveTarget().kind;
  const [pickFailed, setPickFailed] = React.useState(false);

  const chooseFolder = async () => {
    try {
      const target = await pickDirectoryTarget();
      if (target) setSaveTarget(target);
    } catch {
      setPickFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-md" data-testid="queue">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <Label tone="muted">Batch</Label>
          <p className="font-body font-semibold" aria-live="polite">
            {inFlight > 0
              ? `Converting ${Math.min(finishedCount + 1, c.total)} of ${c.total}` +
                (eta > 0 ? ` · ${formatLeft(eta)}` : "")
              : `Batch finished: ${c.done} saved, ${c.failed} failed, ${c.skipped} skipped`}
          </p>
        </div>
        <div className="flex gap-sm">
          {inFlight > 0 && supportsDirectorySave() && saveKind === "download" && (
            <Button variant="secondary" type="button" onClick={() => void chooseFolder()}>
              Save to folder…
            </Button>
          )}
          {inFlight > 0 ? (
            <Button variant="secondary" type="button" onClick={cancelAll}>
              Stop batch
            </Button>
          ) : (
            <Button variant="secondary" type="button" onClick={resetQueue}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {inFlight > 0 && (
        <p className="text-sm text-text-muted">
          Keep this tab open. Converting runs in your browser
          {saveKind === "download"
            ? "; each video downloads as it finishes (your browser may ask to allow multiple downloads)."
            : "; each video is saved to your folder as it finishes."}
        </p>
      )}
      {pickFailed && (
        <p className="text-sm text-text-muted" role="alert">
          Couldn't open the folder picker; videos will download instead.
        </p>
      )}

      {/* Overall progress: count-based, stable */}
      {inFlight > 0 && c.total > 1 && (
        <div
          role="progressbar"
          aria-label="Batch progress"
          aria-valuenow={finishedCount}
          aria-valuemin={0}
          aria-valuemax={c.total}
          className="h-2 w-full overflow-hidden rounded-pill bg-background-sunken"
        >
          <div
            className="h-full rounded-pill bg-[image:var(--brand-gradient)] transition-[width] duration-200 ease-out"
            style={{ width: `${Math.max((finishedCount / c.total) * 100, 4)}%` }}
          />
        </div>
      )}

      {/* Rows */}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {state.items.map((item) => {
          const badge = phaseBadge(item);
          return (
            <li
              key={item.id}
              data-testid="queue-row"
              className="flex items-center justify-between gap-md px-lg py-md"
            >
              <div className="min-w-0">
                <p className="truncate font-body font-semibold">{item.label}</p>
                <p
                  className={cn(
                    "text-sm",
                    badge.tone === "error"
                      ? "text-brand-strong"
                      : badge.tone === "brand"
                        ? "text-brand"
                        : "text-text-muted"
                  )}
                >
                  {badge.text}
                </p>
              </div>
              <RowAction item={item} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
