'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  code: string | null;
  label?: string;
  stringEntries?: StringEntry[];
  activeUtf8Index?: number;
  activeConstTable?: string;
  navigationToken?: string;
  highlightLines?: number[];
  onClickEntry?: (entry: StringEntry) => void;
}

// Line height matches CSS: font-size 13px × line-height 1.6
const LINE_H = 13 * 1.6;

export default function CodePanel({
  code,
  label,
  stringEntries,
  activeUtf8Index,
  activeConstTable,
  navigationToken,
  highlightLines = [],
  onClickEntry,
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const accumulated = useRef(0);
  const panelId = useId();
  const { resolvedTheme } = useTheme();

  // ─── Line-by-line wheel scroll ─────────────────────────────────────────────

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= LINE_H;        // deltaMode LINE → pixels
      if (e.deltaMode === 2) px *= pane!.clientHeight; // deltaMode PAGE → pixels

      accumulated.current += px;
      const lines = Math.trunc(accumulated.current / LINE_H);
      if (lines !== 0) {
        pane!.scrollTop += lines * LINE_H;
        accumulated.current -= lines * LINE_H;
      }
    }

    pane.addEventListener('wheel', onWheel, { passive: false });
    return () => pane.removeEventListener('wheel', onWheel);
  }, []);

  // ─── Shiki render + string transformer ────────────────────────────────────

  useEffect(() => {
    if (code === null) { setHtml(null); return; }
    setHtml(null); // show loading while syntax highlighting renders
    let cancelled = false;

    getHighlighter().then(h => {
      if (cancelled) return;

      const theme = resolvedTheme === 'light' ? 'github-light' : 'one-dark-pro';
      const decoded = decodeJavaUnicode(code);

      // Group entries by line for O(1) lookup inside the transformer
      const entriesByLine = new Map<number, StringEntry[]>();
      for (const entry of stringEntries ?? []) {
        const list = entriesByLine.get(entry.startLine);
        if (list) list.push(entry);
        else entriesByLine.set(entry.startLine, [entry]);
      }

      const result = h.codeToHtml(decoded, {
        lang: 'java',
        theme,
        transformers: [
          // ── String chip transformer ──────────────────────────────────────
          {
            span(node, line, col) {
              const lineEntries = entriesByLine.get(line);
              if (!lineEntries) return;

              // Resolve text content of this token
              const text = (node.children as Array<{ type: string; value?: string }>)
                .filter(c => c.type === 'text')
                .map(c => c.value ?? '')
                .join('');
              if (!text) return;

              // Use range overlap: token [col, col+len) overlaps entry [startCol-1, endCol).
              // The tokenizer sometimes bundles a leading space with the next token (e.g. " \"str\""),
              // so a plain col >= startCol-1 check can miss the token.
              const tokenEnd = col + text.length;
              for (const entry of lineEntries) {
                if (col < entry.endCol && tokenEnd > entry.startCol - 1) {
                  const cls = (node.properties.class as string | undefined) ?? '';
                  node.properties.class = cls ? `${cls} str-chip` : 'str-chip';
                  node.properties['data-str-id'] = String(entry.id);
                  node.properties['data-utf8-index'] = String(entry.utf8Index);
                  node.properties['data-const-table'] = entry.constTable ?? '';
                  break;
                }
              }
            },
          },
          {
            line(node: { properties: Record<string, unknown> }, lineNum: number) {
              node.properties['data-line'] = String(lineNum);
            },
          },

        ],
      });

      if (!cancelled) setHtml(result);
    });

    return () => { cancelled = true; };
  }, [code, resolvedTheme, stringEntries]);

  // ─── Active string highlight (no Shiki re-run needed) ─────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.str-chip--active')
      .forEach(el => el.classList.remove('str-chip--active'));
    if (activeUtf8Index == null) return;
    const sel = `[data-utf8-index="${activeUtf8Index}"][data-const-table="${activeConstTable ?? ''}"]`;
    container.querySelectorAll(sel).forEach(el => el.classList.add('str-chip--active'));
  }, [html, activeUtf8Index, activeConstTable]);

  // ─── Highlight lines (DOM mutation, no Shiki re-run) ─────────────────────


  // ─── Scroll to highlight line ──────────────────────────────────────────────

  useEffect(() => {
    if (!highlightLines.length || !containerRef.current || html === null) return;
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-line="${highlightLines[0]}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }, [html, highlightLines, navigationToken]);

  // ─── Click handler (event delegation) ─────────────────────────────────────

  const handleCodeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClickEntry) return;
    const target = (e.target as Element).closest('[data-str-id]') as HTMLElement | null;
    if (!target) return;
    const entryId = parseInt(target.dataset.strId!, 10);
    const entry = stringEntries?.find(se => se.id === entryId);
    if (entry) onClickEntry(entry);
  }, [onClickEntry, stringEntries]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (code === null) {
    return (
      <div className="code-pane" ref={paneRef}>
        {label && <div className="code-pane-label">{label}</div>}
        <div className="code-pane-missing">文件不存在</div>
      </div>
    );
  }

  return (
    <div className="code-pane" ref={paneRef}>
      {label && <div className="code-pane-label">{label}</div>}
      {html === null && <div className="code-loading">加载中...</div>}
      {highlightLines.length > 0 && (
        <style>{highlightLines.map(lineNum => `
[data-code-panel="${panelId}"] [data-line="${lineNum}"] {
  background: var(--hl-active-bg);
  border-left: 2px solid var(--hl-active-border);
}
[data-code-panel="${panelId}"] [data-line="${lineNum}"]::before {
  opacity: 0.7;
  padding-left: 2px;
}
`).join('\n')}</style>
      )}
      <div
        data-code-panel={panelId}
        ref={containerRef}
        className="code-viewer"
        dangerouslySetInnerHTML={{ __html: html ?? '' }}
        onClick={handleCodeClick}
      />
    </div>
  );
}
