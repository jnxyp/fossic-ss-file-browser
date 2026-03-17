'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Highlighter } from 'shiki';
import type { StringEntry } from '@/lib/types';

// ─── Shiki singleton ───────────────────────────────────────────────────────────

let _highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!_highlighterPromise) {
    _highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['one-dark-pro', 'github-light'],
        langs: ['java'],
      })
    );
  }
  return _highlighterPromise;
}

// ─── Decode Java \uXXXX escapes ───────────────────────────────────────────────

function decodeJavaUnicode(s: string) {
  return s.replace(/\\u+([0-9a-fA-F]{4})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

// ─── Range-based overlay rect ─────────────────────────────────────────────────

interface OverlayRect {
  entry: StringEntry;
  top: number;
  left: number;
  width: number;
  height: number;
}

function getCharRect(lineEl: Element, startCol: number, endCol: number): DOMRect | null {
  let charPos = 0;
  const range = document.createRange();
  let startSet = false;

  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;

  while (node) {
    const len = node.length;
    if (!startSet && charPos + len >= startCol) {
      range.setStart(node, startCol - charPos);
      startSet = true;
    }
    if (startSet && charPos + len >= endCol) {
      range.setEnd(node, endCol - charPos);
      return range.getBoundingClientRect();
    }
    charPos += len;
    node = walker.nextNode() as Text | null;
  }
  return null;
}

function computeOverlayRects(
  container: HTMLElement,
  entries: StringEntry[],
): OverlayRect[] {
  const lineEls = container.querySelectorAll('code .line');
  const containerRect = container.getBoundingClientRect();
  const result: OverlayRect[] = [];

  for (const entry of entries) {
    // We only handle single-line entries for the first pass
    const lineEl = lineEls[entry.startLine - 1];
    if (!lineEl) continue;

    // startCol points to the first content char (after opening quote);
    // subtract 1 to include the opening quote in the highlight rect
    const rect = getCharRect(lineEl, entry.startCol - 1, entry.endCol);
    if (!rect || rect.width === 0) continue;

    result.push({
      entry,
      top: rect.top - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left + container.scrollLeft,
      width: rect.width,
      height: rect.height,
    });
  }

  return result;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  code: string | null;
  label?: string;
  stringEntries?: StringEntry[];
  /** utf8Index + constTable of the "current" (highlighted) entry */
  activeUtf8Index?: number;
  activeConstTable?: string;
  highlightLines?: number[];
  onClickEntry?: (entry: StringEntry) => void;
}

export default function CodePanel({
  code,
  label,
  stringEntries,
  activeUtf8Index,
  activeConstTable,
  highlightLines = [],
  onClickEntry,
}: Props) {
  const [html, setHtml] = useState('');
  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // Shiki render
  useEffect(() => {
    if (code === null) { setHtml(''); return; }
    let cancelled = false;

    getHighlighter().then(h => {
      if (cancelled) return;
      const theme = resolvedTheme === 'light' ? 'github-light' : 'one-dark-pro';
      const decoded = decodeJavaUnicode(code);

      const result = h.codeToHtml(decoded, {
        lang: 'java',
        theme,
        transformers: highlightLines.length > 0 ? [{
          name: 'hl-lines',
          line(node, line) {
            if (highlightLines.includes(line)) {
              const cls = node.properties.class as string | string[];
              node.properties.class = Array.isArray(cls)
                ? [...cls, 'hl-line']
                : [cls, 'hl-line'].filter(Boolean).join(' ');
            }
          },
        }] : [],
      });
      if (!cancelled) setHtml(result);
    });

    return () => { cancelled = true; };
  }, [code, resolvedTheme, highlightLines]);

  // Compute overlay positions after render
  useEffect(() => {
    if (!stringEntries?.length || !containerRef.current || !html) {
      setOverlayRects([]);
      return;
    }
    // rAF to ensure DOM is painted
    const id = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      setOverlayRects(computeOverlayRects(containerRef.current, stringEntries));
    });
    return () => cancelAnimationFrame(id);
  }, [html, stringEntries]);

  // Recompute on resize
  useEffect(() => {
    if (!stringEntries?.length || !containerRef.current) return;
    const obs = new ResizeObserver(() => {
      if (!containerRef.current) return;
      setOverlayRects(computeOverlayRects(containerRef.current, stringEntries));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [stringEntries]);

  // Scroll to highlight line
  useEffect(() => {
    if (!highlightLines.length || !containerRef.current || !html) return;
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector('.hl-line');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [html, highlightLines]);

  if (code === null) {
    return (
      <div className="code-pane">
        {label && <div className="code-pane-label">{label}</div>}
        <div className="code-pane-missing">文件不存在</div>
      </div>
    );
  }

  return (
    <div className="code-pane">
      {label && <div className="code-pane-label">{label}</div>}
      <div
        ref={containerRef}
        className="code-viewer"
        dangerouslySetInnerHTML={{
          __html: html || `<pre><code>${decodeJavaUnicode(code)}</code></pre>`,
        }}
      />
      {/* String overlay */}
      {overlayRects.length > 0 && (
        <div className="string-overlay" aria-hidden="true">
          {overlayRects.map(r => {
            const isCurrent =
              r.entry.utf8Index === activeUtf8Index &&
              r.entry.constTable === (activeConstTable ?? '');
            return (
              <div
                key={r.entry.id}
                className={`string-chip${isCurrent ? ' current' : ''}`}
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                title={r.entry.value}
                onClick={() => onClickEntry?.(r.entry)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
