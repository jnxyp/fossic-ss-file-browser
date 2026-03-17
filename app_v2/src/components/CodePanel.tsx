'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // ─── Shiki render + string transformer ────────────────────────────────────

  useEffect(() => {
    if (code === null) { setHtml(''); return; }
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

          // ── Highlight lines transformer ──────────────────────────────────
          ...(highlightLines.length > 0 ? [{
            line(node: { properties: Record<string, unknown> }, lineNum: number) {
              if (highlightLines.includes(lineNum)) {
                const cls = (node.properties.class as string | undefined) ?? '';
                node.properties.class = cls ? `${cls} hl-line` : 'hl-line';
              }
            },
          }] : []),
        ],
      });

      if (!cancelled) setHtml(result);
    });

    return () => { cancelled = true; };
  }, [code, resolvedTheme, highlightLines, stringEntries]);

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

  // ─── Scroll to highlight line ──────────────────────────────────────────────

  useEffect(() => {
    if (!highlightLines.length || !containerRef.current || !html) return;
    requestAnimationFrame(() => {
      containerRef.current?.querySelector('.hl-line')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [html, highlightLines]);

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
        onClick={handleCodeClick}
      />
    </div>
  );
}
