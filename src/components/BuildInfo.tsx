import { Tooltip } from "@/components/ui";
import { APP_NAME, APP_VERSION, BUILD_COMMIT, BUILD_TIME, COMMIT_URL } from "@/lib/buildInfo";

const InfoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Small, unobtrusive build badge: version + commit, linking to the exact commit. */
export function BuildInfo() {
  return (
    <Tooltip
      label={`${APP_NAME} v${APP_VERSION} · build ${BUILD_COMMIT} · ${formatBuildTime(BUILD_TIME)}`}
    >
      <a
        href={COMMIT_URL}
        target="_blank"
        rel="noreferrer"
        aria-label={`${APP_NAME} version ${APP_VERSION}, build ${BUILD_COMMIT}`}
        className="inline-flex items-center gap-1 rounded-sm font-mono text-caption text-text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        <InfoIcon />v{APP_VERSION} · {BUILD_COMMIT}
      </a>
    </Tooltip>
  );
}
