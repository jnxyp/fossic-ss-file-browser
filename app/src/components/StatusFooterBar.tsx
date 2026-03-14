'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Manifest } from '@/lib/manifest';

function formatRevision(revision: string): string {
  if (!revision || revision === 'initial') {
    return '--';
  }

  return revision.slice(0, 7);
}

function formatDate(dateString: string): string {
  if (!dateString) {
    return '--';
  }

  try {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function getRevisionUrl(revision: string): string | null {
  if (!revision || revision === 'initial') {
    return null;
  }

  return `https://github.com/TruthOriginem/Starsector-Localization-CN/commit/${revision}`;
}

const THEME_STATE_MAP = {
  system: { icon: '◐', label: '跟随系统', next: 'light' as const },
  light: { icon: '☀', label: '浅色', next: 'dark' as const },
  dark: { icon: '☾', label: '深色', next: 'system' as const },
} as const;

export default function StatusFooterBar() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    async function fetchManifest() {
      try {
        const response = await fetch('/api/manifest');
        if (!response.ok) {
          return;
        }

        setManifest(await response.json());
      } catch {
        // Ignore transient footer refresh errors.
      }
    }

    void fetchManifest();
  }, []);

  const currentTheme = theme ?? 'system';
  const themeState = THEME_STATE_MAP[currentTheme as keyof typeof THEME_STATE_MAP] ?? THEME_STATE_MAP.system;
  const revision = manifest?.revision ?? '';
  const revisionUrl = getRevisionUrl(revision);

  return (
    <footer className="status-footer">
      <div className="status-footer-meta">
        <span className="status-item">
          版本{' '}
          {revisionUrl ? (
            <a
              className="status-link"
              href={revisionUrl}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{formatRevision(revision)}</strong>
            </a>
          ) : (
            <strong>{formatRevision(revision)}</strong>
          )}
        </span>
        <span className="status-item">
          更新时间 <strong>{formatDate(manifest?.lastUpdated ?? '')}</strong>
        </span>
      </div>

      <button
        type="button"
        className={`theme-toggle active theme-toggle-${currentTheme}`}
        onClick={() => setTheme(themeState.next)}
        aria-label={`当前主题：${themeState.label}`}
      >
        <span className="theme-toggle-icon" aria-hidden="true">{themeState.icon}</span>
        <span>{themeState.label}</span>
      </button>
    </footer>
  );
}
