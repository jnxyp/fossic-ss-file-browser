'use client';

import { useEffect, useRef, useState } from 'react';
import type { Highlighter, ShikiTransformer } from 'shiki';

interface CodeViewerProps {
  code: string;
  lang?: string;
  highlightLines?: number[];
}

// 模块级单例：避免每次渲染都重新初始化 Shiki（包含 WASM，初始化较慢）
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    const { createHighlighter } = await import('shiki');
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['java', 'json', 'text'],
    });
  }
  return highlighterPromise;
}

export default function CodeViewer({ code, lang = 'java', highlightLines = [] }: CodeViewerProps) {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const h = await getHighlighter();
      if (cancelled) return;

      // 不在支持列表里的语言降级为纯文本
      const safeLang = ['java', 'json'].includes(lang) ? lang : 'text';

      const result = h.codeToHtml(code, {
        lang: safeLang,
        theme: 'github-dark',
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
  }, [code, lang, highlightLines]);

  // 高亮完成后滚动到第一个目标行
  useEffect(() => {
    if (!html || highlightLines.length === 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector('.highlighted-line');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [html, highlightLines]);

  return (
    <div
      ref={containerRef}
      className="code-viewer"
      dangerouslySetInnerHTML={{
        __html: html || `<pre style="padding:1.5rem;color:#8b949e;font-size:13px;font-family:monospace">${code}</pre>`,
      }}
    />
  );
}
