import { ApiError, requestScope } from "./api";

export type Outcome = "created" | "skipped" | "repaired";
export type BatchProgress = {
  total: number;
  done: number;
  created: number;
  skipped: number;
  repaired: number;
  failed: number;
  failures: { label: string; reason: string; diagnostic: string }[];
};
export type BatchReport = BatchProgress;

export function emptyProgress(total: number): BatchProgress {
  return { total, done: 0, created: 0, skipped: 0, repaired: 0, failed: 0, failures: [] };
}

export async function runBatch<T>(
  items: T[],
  label: (item: T) => string,
  work: (item: T) => Promise<Outcome>,
  onProgress: (p: BatchProgress) => void,
  concurrency = 3,
): Promise<BatchReport> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid batch concurrency");
  const progress = emptyProgress(items.length);
  let next = 0;
  let stopped = false;
  const scope = requestScope();
  const publish = () => onProgress({ ...progress, failures: [...progress.failures] });
  publish();
  const worker = async () => {
    while (!stopped && next < items.length) {
      const item = items[next++];
      try {
        if (scope?.aborted) throw new ApiError(0, "Setup page closed", "POST", "");
        progress[await work(item)]++;
      } catch (error) {
        progress.failed++;
        progress.failures.push({
          label: label(item),
          reason: error instanceof Error ? error.message : "This item could not be added.",
          diagnostic: error instanceof ApiError ? `${error.method} ${error.path} (${error.status}): ${error.detail}` : "",
        });
        if (error instanceof ApiError && [0, 401, 403].includes(error.status)) stopped = true;
      }
      progress.done++;
      publish();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return progress;
}

// Sends pending items in all-or-nothing chunks (e.g. CARE upsert endpoints), counting each item's outcome.
export async function runChunkedBatch<T>(
  items: T[],
  label: (item: T) => string,
  exists: (item: T) => boolean,
  work: (chunk: T[]) => Promise<void>,
  onProgress: (p: BatchProgress) => void,
  chunkSize = 100,
): Promise<BatchReport> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid batch size");
  const progress = emptyProgress(items.length);
  const publish = () => onProgress({ ...progress, failures: [...progress.failures] });
  const pending = items.filter((item) => !exists(item));
  progress.skipped = progress.done = items.length - pending.length;
  publish();
  const scope = requestScope();
  for (let start = 0; start < pending.length; start += chunkSize) {
    const chunk = pending.slice(start, start + chunkSize);
    try {
      if (scope?.aborted) throw new ApiError(0, "Setup page closed", "POST", "");
      await work(chunk);
      progress.created += chunk.length;
    } catch (error) {
      progress.failed += chunk.length;
      const first = label(chunk[0]);
      progress.failures.push({
        label: chunk.length > 1 ? `${first} and ${chunk.length - 1} more` : first,
        reason: error instanceof Error ? error.message : "These items could not be added.",
        diagnostic: error instanceof ApiError ? `${error.method} ${error.path} (${error.status}): ${error.detail}` : "",
      });
      if (error instanceof ApiError && [0, 401, 403].includes(error.status)) {
        progress.done += chunk.length;
        publish();
        break;
      }
    }
    progress.done += chunk.length;
    publish();
  }
  return progress;
}
