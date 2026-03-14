'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Highlighter, ShikiTransformer } from 'shiki';

interface CodeViewerProps {
  code: string;
  lang?: string;
  highlightLines?: number[];
}

function decodeJavaUnicodeEscapes(input: string) {
  return input.replace(/\\u+([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

// 模块级单例：避免每次渲染都重新初始化 Shiki（包含 WASM，初始化较慢）
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    const { createHighlighter } = await import('shiki');
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['java', 'json', 'text'],
    });
  }
  return highlighterPromise;
}

export default function CodeViewer({ code, lang = 'java', highlightLines = [] }: CodeViewerProps) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const displayCode = lang === 'java' ? decodeJavaUnicodeEscapes(code) : code;

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const h = await getHighlighter();
      if (cancelled) return;

      // 不在支持列表里的语言降级为纯文本
      const safeLang = ['java', 'json'].includes(lang) ? lang : 'text';

      const theme = resolvedTheme === 'light' ? 'github-light' : 'github-dark';

      const result = h.codeToHtml(displayCode, {
        lang: safeLang,
        theme,
        transformers: highlightLines.length > 0
          ? [({
              name: 'highlight-lines',
              line(node, line) {
                if (highlightLines.includes(line)) {
                  const cls = node.properties.class;
                  node.properties.class = Array.isArray(cls)
                    ? [...cls, 'highlighted-line']
                    : [cls, 'highlighted-line'].filter(Boolean).join(' ');
                }
              },
            }) satisfies ShikiTransformer]
          : [],
      });

      if (!cancelled) setHtml(result);
    }

    highlight();
    return () => { cancelled = true; };
  }, [displayCode, highlightLines, lang, resolvedTheme]);

  // 高亮完成后滚动到第一个目标行
  useEffect(() => {
    if (!html || highlightLines.length === 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector('.highlighted-line');
    el?.scrollIntoView({ block: 'center' });
  }, [html, highlightLines]);

  return (
    <div
      ref={containerRef}
      className="code-viewer"
      dangerouslySetInnerHTML={{
        __html: html || `<pre style="padding:1.5rem;color:#8b949e;font-size:13px;font-family:monospace">${displayCode}</pre>`,
      }}
    />
  );
}
