'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dataset, SearchMatch, SearchResult } from '@/lib/types';

interface Props {
  onNavigate: (jarName: string, filePath: string, startLine?: number, dataset?: Dataset) => void;
}

const STEP = 22;
const SEARCH_DELAY_MS = 300;

function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + trimmed.length);
  const after = text.slice(index + trimmed.length);

  return (
    <>
      {before}
      <mark className="search-match-highlight">{match}</mark>
      {after}
    </>
  );
}

export default function SearchPanel({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);
  const accumulated = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const scrollElement = resultsRef.current;
    if (!scrollElement) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= STEP;
      if (e.deltaMode === 2) px *= scrollElement!.clientHeight;
      accumulated.current += px;
      const steps = Math.trunc(accumulated.current / STEP);
      if (steps !== 0) {
        scrollElement!.scrollTop += steps * STEP;
        accumulated.current -= steps * STEP;
      }
    }
    scrollElement.addEventListener('wheel', onWheel, { passive: false });
    return () => scrollElement.removeEventListener('wheel', onWheel);
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
          const stringMatches = group.matches.filter((m): m is SearchMatch & { type: 'string' } => m.type === 'string');

          return (
            <div key={key} className="search-group">
              <div
                className="search-group-header"
                onClick={() => onNavigate(group.jarName, group.sourcePath)}
              >
                {stringMatches.length > 0 ? (
                  <button
                    type="button"
                    className="search-group-toggle"
                    onClick={e => {
                      e.stopPropagation();
                      toggleCollapse(key);
                    }}
                    aria-label={isCollapsed ? '展开结果' : '折叠结果'}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="search-group-spacer" aria-hidden="true" />
                )}
                <div className="search-group-main" title={group.sourcePath}>
                  <span className="search-group-name">
                    {highlightMatch(fileName, query)}
                  </span>
                  <span className="search-group-path">
                    {highlightMatch(group.sourcePath, query)}
                  </span>
                </div>
                {stringMatches.length > 0 && (
                  <span className="search-group-count">{stringMatches.length}</span>
                )}
              </div>

              {!isCollapsed && stringMatches.map((m, i) => (
                <div
                  key={`${m.dataset ?? 'none'}-${m.startLine ?? 0}-${m.utf8Index ?? i}-${i}`}
                  className="search-match-item"
                  onClick={() => onNavigate(group.jarName, group.sourcePath, m.startLine, m.dataset)}
                >
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
