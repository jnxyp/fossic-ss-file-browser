'use client';

const CONNECTION_EVENT = 'ssfb:paratranz-connection-change';

function getWindowState() {
  return window as Window & { __ssfbParatranzConnected?: boolean };
}

export function readParatranzConnection(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(getWindowState().__ssfbParatranzConnected);
}

export function writeParatranzConnection(connected: boolean): void {
  if (typeof window === 'undefined') return;

  const next = Boolean(connected);
  const state = getWindowState();
  if (state.__ssfbParatranzConnected === next) return;

  state.__ssfbParatranzConnected = next;
  window.dispatchEvent(new CustomEvent<boolean>(CONNECTION_EVENT, { detail: next }));
}

export function subscribeParatranzConnection(
  listener: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<boolean>).detail);
  };

  window.addEventListener(CONNECTION_EVENT, handler);
  return () => window.removeEventListener(CONNECTION_EVENT, handler);
}
