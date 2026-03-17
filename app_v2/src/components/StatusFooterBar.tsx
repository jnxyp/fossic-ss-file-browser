'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import type { MetaInfo } from '@/lib/types';

const THEME_CYCLE = {
  system: { icon: '◐', label: '跟随系统', next: 'light' as const },
  light:  { icon: '☀', label: '浅色',     next: 'dark' as const },
  dark:   { icon: '☾', label: '深色',     next: 'system' as const },
} as const;

function fmtRevision(r: string) { return r ? r.slice(0, 7) : '--'; }
function fmtDate(d: string) {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
}

export default function StatusFooterBar() {
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    fetch('/api/meta')
      .then(r => r.ok ? r.json() : null)
      .then((d: MetaInfo | null) => { if (d) setMeta(d); })
      .catch(() => undefined);
  }, []);

  const t = THEME_CYCLE[(theme ?? 'system') as keyof typeof THEME_CYCLE] ?? THEME_CYCLE.system;
  const rev = meta?.revision ?? '';
  const revUrl = rev
    ? `https://github.com/TruthOriginem/Starsector-Localization-CN/commit/${rev}`
    : null;

  return (
    <footer className="status-footer">
      <div className="status-left">
        <span className="status-item">
          版本{' '}
          {revUrl ? (
            <a className="status-link" href={revUrl} target="_blank" rel="noreferrer">
              <strong>{fmtRevision(rev)}</strong>
            </a>
          ) : (
            <strong>{fmtRevision(rev)}</strong>
          )}
        </span>
        <span className="status-item">更新 {fmtDate(meta?.lastUpdated ?? '')}</span>
      </div>

      <button
        type="button"
        className="theme-toggle"
        onClick={() => setTheme(t.next)}
        aria-label={`主题：${t.label}`}
      >
        <span aria-hidden="true">{t.icon}</span>
        <span>{t.label}</span>
      </button>
    </footer>
  );
}
