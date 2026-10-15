type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSyncRequested(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function requestSync() {
  // Let the caller's SQLite transaction commit before the worker reads the queue.
  setTimeout(() => listeners.forEach((listener) => listener()), 250);
}
