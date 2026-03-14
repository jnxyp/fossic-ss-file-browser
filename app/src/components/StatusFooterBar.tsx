'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Manifest } from '@/lib/manifest';

function formatRevision(revision: string): string {
  if (!revision || revision === 'initial') {
    return '--';
  }

  return revision.slice(0, 8);
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

export default function StatusFooterBar() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

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

    fetchManifest();
  }, []);

  const currentTheme = mounted ? (theme ?? 'system') : 'system';
  const themeState = {
    system: { icon: '◐', label: '跟随系统', next: 'light' as const },
    light: { icon: '☀', label: '浅色', next: 'dark' as const },
    dark: { icon: '☾', label: '深色', next: 'system' as const },
  }[currentTheme];

  const revision = manifest?.revision ?? '';
  return (
    <footer className="status-footer">
      <div className="status-footer-meta">
        <span className="status-item">
          版本 <strong>{formatRevision(manifest?.revision ?? '')}</strong>
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
