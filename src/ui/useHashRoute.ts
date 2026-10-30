import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function read(): string {
  return window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
}

/** First path segment of the hash route: `#/sho` → `sho`. */
export function useHashRoute(): string {
  return useSyncExternalStore(subscribe, read, () => '');
}

export function navigate(id: string): void {
  window.location.hash = `/${id}`;
}
