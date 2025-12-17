/**
 * Detects the current context (Window or ServiceWorker)
 */
export function getContext(): 'window' | 'serviceworker' | 'unknown' {
  if (typeof globalThis === 'undefined') {
    return 'unknown';
  }

  // Check for window context
  if (typeof window !== 'undefined' && globalThis === window) {
    return 'window';
  }

  // ServiceWorkers have 'importScripts' and 'skipWaiting' functions
  if (
    typeof (globalThis as any).importScripts === 'function' &&
    typeof (globalThis as any).skipWaiting === 'function'
  ) {
    return 'serviceworker';
  }

  return 'unknown';
}
