'use client';

import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@/lib/types';

interface Props {
  onNavigate: (jarName: string, filePath: string, startLine?: number) => void;
}

const STEP = 22;

export default function SearchPanel({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'class' | 'string'>('class');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const accumulated = useRef(0);

  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= STEP;
      if (e.deltaMode === 2) px *= el!.clientHeight;
      accumulated.current += px;
      const steps = Math.trunc(accumulated.current / STEP);
      if (steps !== 0) {
        el!.scrollTop += steps * STEP;
        accumulated.current -= steps * STEP;
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  async function doSearch(searchType = type) {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setCollapsed(new Set());
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${searchType}`);
      const d: { results: SearchResult[] } = await r.json();
      setResults(d.results ?? []);
    } finally {
      setLoading(false);
    }
  }

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
          ref={inputRef}
          className="search-input"
          placeholder="搜索..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void doSearch(); }}
        />
        <div className="search-type-row">
          <button
            type="button"
            className={`search-type-btn${type === 'class' ? ' active' : ''}`}
            onClick={() => { setType('class'); void doSearch('class'); }}
          >
            类名
          </button>
          <button
            type="button"
            className={`search-type-btn${type === 'string' ? ' active' : ''}`}
            onClick={() => { setType('string'); void doSearch('string'); }}
          >
            字符串
          </button>
        </div>
      </div>

      <div className="search-results" ref={resultsRef}>
        {loading && <div className="search-hint">搜索中...</div>}

        {!loading && results === null && (
          <div className="search-hint">输入关键词后按 Enter</div>
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
                  key={i}
                  className="search-match-item"
                  onClick={() => onNavigate(group.jarName, group.sourcePath, m.startLine)}
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
