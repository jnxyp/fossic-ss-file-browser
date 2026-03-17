'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CodePanel from './CodePanel';
import type { StringEntry, ViewMode, Dataset } from '@/lib/types';

const MODE_KEY = 'ssfb:view-mode';
const SPLIT_KEY = 'ssfb:split-ratio';
const DEFAULT_SPLIT = 0.5;

function clampSplit(v: number) { return Math.min(0.85, Math.max(0.15, v)); }

function readMode(): ViewMode {
  try { return (localStorage.getItem(MODE_KEY) as ViewMode) ?? 'localization'; } catch { return 'localization'; }
}
function saveMode(m: ViewMode) { try { localStorage.setItem(MODE_KEY, m); } catch { /* */ } }
function readSplit(): number {
  try { return clampSplit(parseFloat(localStorage.getItem(SPLIT_KEY) ?? '0.5')); } catch { return DEFAULT_SPLIT; }
}
function saveSplit(v: number) { try { localStorage.setItem(SPLIT_KEY, String(v)); } catch { /* */ } }

// ─── Sync-scroll hook ─────────────────────────────────────────────────────────

function useSyncScroll(active: boolean) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!active) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    function onLeft() {
      if (syncing.current || !right) return;
      syncing.current = true;
      right.scrollTop = left!.scrollTop;
      right.scrollLeft = left!.scrollLeft;
      syncing.current = false;
    }
    function onRight() {
      if (syncing.current || !left) return;
      syncing.current = true;
      left.scrollTop = right!.scrollTop;
      left.scrollLeft = right!.scrollLeft;
      syncing.current = false;
    }

    left.addEventListener('scroll', onLeft, { passive: true });
    right.addEventListener('scroll', onRight, { passive: true });
    return () => {
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
    };
  }, [active]);

  return { leftRef, rightRef };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jarName: string;
  filePath: string;
  /** The target class (may include $inner suffix) for string lookup */
  targetClass: string;
  activeUtf8Index?: number;
  activeConstTable?: string;
  highlightLines?: number[];
  onClickEntry?: (entry: StringEntry, dataset: Dataset) => void;
}

interface ContentState {
  original: string | null;
  localization: string | null;
  loadingOrig: boolean;
  loadingLoc: boolean;
}

export default function ViewerArea({
  jarName,
  filePath,
  targetClass,
  activeUtf8Index,
  activeConstTable,
  highlightLines = [],
  onClickEntry,
}: Props) {
  const [mode, setMode] = useState<ViewMode>(readMode);
  const [split, setSplit] = useState(readSplit);
  // contentFor tracks which file the loaded content belongs to.
  // When filePath changes, loading is derived as true immediately (first render),
  // so the overlay appears before any effect fires.
  const [contentFor, setContentFor] = useState({ jarName: '', filePath: '' });
  const [content, setContent] = useState<ContentState>({
    original: null, localization: null, loadingOrig: false, loadingLoc: false,
  });
  const [stringEntries, setStringEntries] = useState<{
    original: StringEntry[] | null; localization: StringEntry[] | null;
  }>({ original: null, localization: null });

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const { leftRef, rightRef } = useSyncScroll(mode === 'parallel');

  function changeMode(m: ViewMode) {
    setMode(m);
    saveMode(m);
  }

  // Always fetch both datasets — CSS controls which panel is visible
  const fetchSide = useCallback(async (dataset: Dataset): Promise<string | null> => {
    if (!jarName || !filePath) return null;
    const r = await fetch(
      `/api/files/content?jar=${encodeURIComponent(jarName)}&class=${encodeURIComponent(filePath)}&dataset=${dataset}`
    );
    if (!r.ok) return null;
    const d: { content: string } = await r.json();
    return d.content;
  }, [jarName, filePath]);

  useEffect(() => {
    if (!jarName || !filePath) return;
    setContent({ original: null, localization: null, loadingOrig: true, loadingLoc: true });
    let cancelled = false;
    Promise.all([fetchSide('original'), fetchSide('localization')]).then(([orig, loc]) => {
      if (cancelled) return;
      setContent({ original: orig, localization: loc, loadingOrig: false, loadingLoc: false });
      setContentFor({ jarName, filePath });
    });
    return () => { cancelled = true; };
  }, [jarName, filePath, fetchSide]);

  // Load string entries for overlay
  useEffect(() => {
    if (!jarName || !filePath) { setStringEntries({ original: null, localization: null }); return; }
    fetch(`/api/files/strings?jar=${encodeURIComponent(jarName)}&class=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then((d: { original: StringEntry[] | null; localization: StringEntry[] | null }) =>
        setStringEntries({ original: d.original, localization: d.localization })
      )
      .catch(() => undefined);
  }, [jarName, filePath]);

  // ─── Split drag ───────────────────────────────────────────────────────────

  function onSplitDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    function onMove(mv: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const ratio = clampSplit((mv.clientX - rect.left) / rect.width);
      setSplit(ratio);
    }
    function onUp(up: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const ratio = clampSplit((up.clientX - rect.left) / rect.width);
      setSplit(ratio);
      saveSplit(ratio);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!jarName || !filePath) {
    return (
      <div className="main-area">
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div>从左侧选择文件，或从 ParaTranz 发起跳转</div>
        </div>
      </div>
    );
  }

  const loading = contentFor.jarName !== jarName || contentFor.filePath !== filePath
    || content.loadingOrig || content.loadingLoc;

  return (
    <div
      className="main-area"
      style={{ '--split': `${split * 100}%` } as React.CSSProperties}
    >
      {/* Mode toggle */}
      <div className="mode-toggle-bar">
        <div className="mode-toggle">
          {(['original', 'parallel', 'localization'] as ViewMode[]).map(m => (
            <button
              key={m}
              type="button"
              className={`mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => changeMode(m)}
            >
              {m === 'original' ? '原文' : m === 'parallel' ? '并列' : '译文'}
            </button>
          ))}
        </div>
      </div>

      {/* Label bar — outside panel wrappers, never hidden */}
      <div className={`panel-labels mode-${mode}`}>
        <div className="panel-label panel-label-orig">原文</div>
        <div className="panel-labels-gap" />
        <div className="panel-label panel-label-loc">译文</div>
      </div>

      {/* Code area — both panels always rendered, CSS controls visibility */}
      <div
        className={`code-area mode-${mode}`}
        ref={splitContainerRef}
      >
        {loading && <div className="code-loading">加载中...</div>}

        <div className="panel-orig" ref={leftRef}>
          <CodePanel
            code={content.original}
            stringEntries={stringEntries.original ?? undefined}
            activeUtf8Index={activeUtf8Index}
            activeConstTable={activeConstTable}
            highlightLines={highlightLines}
            onClickEntry={e => onClickEntry?.(e, 'original')}
          />
        </div>

        <div className="split-resizer" onPointerDown={onSplitDragStart} />

        <div className="panel-loc" ref={rightRef}>
          <CodePanel
            code={content.localization}
            stringEntries={stringEntries.localization ?? undefined}
            activeUtf8Index={activeUtf8Index}
            activeConstTable={activeConstTable}
            highlightLines={highlightLines}
            onClickEntry={e => onClickEntry?.(e, 'localization')}
          />
        </div>
      </div>
    </div>
  );
}
