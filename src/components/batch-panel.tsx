import { Progress } from "@/components/ui/progress";
import type { BatchProgress } from "@/lib/batch";

export function BatchPanel({ title, progress, running }: { title: string; progress: BatchProgress; running: boolean }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {progress.done}/{progress.total}
        </span>
      </div>
      <Progress value={pct} />
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
        <span>{progress.created} added</span>
        <span>{progress.skipped} already present</span>
        {progress.repaired > 0 && <span>{progress.repaired} completed</span>}
        <span className={progress.failed ? "text-danger-ink" : undefined}>{progress.failed} failed</span>
        {running ? <span>working…</span> : null}
      </div>
      {progress.failures.length ? (
        <div className="mt-3">
        <p role="alert" className="text-sm text-danger-ink">{progress.failures[0].reason}</p>
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
