const cancellationSetKey = "__posterLabQueueCancellationRequests";

type QueueCancellationGlobal = typeof globalThis & {
  [cancellationSetKey]?: Set<string>;
};

function cancellationSet(): Set<string> {
  const root = globalThis as QueueCancellationGlobal;
  if (!root[cancellationSetKey]) {
    root[cancellationSetKey] = new Set<string>();
  }
  return root[cancellationSetKey];
}

export function requestQueueCancellation(jobId: string): void {
  if (!jobId) return;
  cancellationSet().add(jobId);
}

export function clearQueueCancellation(jobId: string): void {
  if (!jobId) return;
  cancellationSet().delete(jobId);
}

export function isQueueCancellationRequested(jobId: string): boolean {
  return Boolean(jobId && cancellationSet().has(jobId));
}
