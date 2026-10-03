import { Progress } from "@/components/ui/progress";
import type { BatchProgress } from "@/lib/batch";

export function BatchPanel({ title, progress, running }: { title: string; progress: BatchProgress; running: boolean }) {
  const ready = progress.created + progress.skipped + progress.repaired;
  const pct = progress.total ? Math.round((ready / progress.total) * 100) : 100;
  const complete = ready === progress.total && !progress.failed && !running;
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold text-ink">{title}</h3>
        <span className={`text-sm ${complete ? "font-medium text-brand-ink" : "text-muted-foreground"}`} role="status" aria-live="polite">
          {complete ? "Ready" : running ? "Preparing..." : "Needs attention"}
        </span>
      </div>
      <Progress value={pct} aria-label={`${title} progress`} aria-valuetext={`${ready} of ${progress.total} ready`} />
      <p className="mt-2 text-sm text-muted-foreground">{ready} of {progress.total} ready</p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show details</summary>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>{progress.created} added</span>
          <span>{progress.skipped} already set up</span>
          {progress.repaired > 0 && <span>{progress.repaired} updated</span>}
          {progress.failed > 0 && <span className="text-danger-ink">{progress.failed} need attention</span>}
        </div>
      </details>
      {progress.failures.length ? (
        <div className="mt-3">
        <p role="alert" className="text-sm text-danger-ink">{progress.failures[0].reason}</p>
        {!running && <p className="mt-1 text-sm text-gray-600">Choose Try again below. Items already added will be kept.</p>}
        <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-gray-600">Details for your administrator</summary>
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto rounded-md bg-danger-tint px-3 py-2 text-xs text-danger-ink">
          {progress.failures.map((f, i) => (
            <li key={i}>
              <span className="font-semibold">{f.label}</span>: {f.diagnostic || f.reason}
            </li>
          ))}
        </ul>
        </details>
        </div>
      ) : null}
    </div>
  );
}
