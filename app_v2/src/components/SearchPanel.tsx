'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dataset, SearchResult } from '@/lib/types';

interface Props {
  onNavigate: (jarName: string, filePath: string, startLine?: number, dataset?: Dataset) => void;
}

const STEP = 22;
const SEARCH_DELAY_MS = 300;

export default function SearchPanel({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);
  const accumulated = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const element = resultsRef.current;
    if (!element) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= STEP;
      if (e.deltaMode === 2) px *= element!.clientHeight;
      accumulated.current += px;
      const steps = Math.trunc(accumulated.current / STEP);
      if (steps !== 0) {
        element!.scrollTop += steps * STEP;
        accumulated.current -= steps * STEP;
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      requestIdRef.current += 1;
      setLoading(false);
      setResults(null);
      setCollapsed(new Set());
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setCollapsed(new Set());
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data: { results: SearchResult[] } = await response.json();
        if (requestIdRef.current === requestId) {
          setResults(data.results ?? []);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && requestIdRef.current === requestId) {
          setResults([]);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <input
          className="search-input"
          placeholder="搜索类名或字符串..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="search-results" ref={resultsRef}>
        {loading && <div className="search-hint">搜索中...</div>}

        {!loading && results === null && (
          <div className="search-hint">输入类名或字符串进行搜索</div>
        )}

        {!loading && results !== null && results.length === 0 && (
          <div className="search-hint">无结果</div>
        )}

        {!loading && results !== null && results.map(group => {
          const key = `${group.jarName}\0${group.sourcePath}`;
          const isCollapsed = collapsed.has(key);
          const fileName = group.sourcePath.split('/').pop() ?? group.sourcePath;

          return (
            <div key={key} className="search-group">
              <div
                className="search-group-header"
                onClick={() => toggleCollapse(key)}
              >
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {isCollapsed ? '▸' : '▾'}
                </span>
                <span
                  className="search-group-name"
                  onClick={e => { e.stopPropagation(); onNavigate(group.jarName, group.sourcePath); }}
                  title={group.sourcePath}
                >
                  {fileName}
                </span>
                <span className="search-group-path" title={group.sourcePath}>
                  {group.sourcePath}
                </span>
                <span className="search-group-count">{group.matches.length}</span>
              </div>

              {!isCollapsed && group.matches.map((m, i) => (
                <div
                  key={`${m.type}-${m.dataset ?? 'none'}-${m.startLine ?? 0}-${m.utf8Index ?? i}-${i}`}
                  className="search-match-item"
                  onClick={() => onNavigate(group.jarName, group.sourcePath, m.startLine, m.dataset)}
                >
                  <span className={`search-kind-badge ${m.type}`}>
                    {m.type === 'class' ? '类名' : '字符串'}
                  </span>
                  {m.dataset && (
                    <span className={`dataset-badge ${m.dataset}`}>
                      {m.dataset === 'original' ? '原文' : '译文'}
                    </span>
                  )}
                  <span className="search-match-value" title={m.value ?? m.matchedPath}>
                    {m.value ?? m.matchedPath ?? '—'}
                  </span>
                  {m.startLine != null && (
                    <span className="search-match-meta">:{m.startLine}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
