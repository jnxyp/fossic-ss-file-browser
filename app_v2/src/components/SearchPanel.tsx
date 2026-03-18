'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dataset, SearchMatch, SearchResult } from '@/lib/types';

interface Props {
  onNavigate: (jarName: string, filePath: string, startLine?: number, dataset?: Dataset) => void;
  focusRequest?: number;
}

interface SearchScopeState {
  class: boolean;
  string: boolean;
  code: boolean;
}

interface DisplayMatch extends SearchMatch {
  datasets?: Dataset[];
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

export default function SearchPanel({ onNavigate, focusRequest = 0 }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scopes, setScopes] = useState<SearchScopeState>({
    class: true,
    string: true,
    code: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const accumulated = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const scrollElement = resultsRef.current;
    if (!scrollElement) return;
    const element = scrollElement;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= STEP;
      if (e.deltaMode === 2) px *= element.clientHeight;
      accumulated.current += px;
      const steps = Math.trunc(accumulated.current / STEP);
      if (steps !== 0) {
        element.scrollTop += steps * STEP;
        accumulated.current -= steps * STEP;
      }
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed || (!scopes.class && !scopes.string && !scopes.code)) {
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
        const params = new URLSearchParams({
          q: trimmed,
          class: scopes.class ? '1' : '0',
          string: scopes.string ? '1' : '0',
          code: scopes.code ? '1' : '0',
        });
        const response = await fetch(`/api/search?${params}`, {
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
  }, [query, scopes]);

  useEffect(() => {
    if (focusRequest === 0) return;
    const input = inputRef.current;
    if (!input) return;

    input.focus();
    if (input.value) input.select();
  }, [focusRequest]);

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }

  function toggleScope(scope: keyof SearchScopeState) {
    setScopes(prev => ({ ...prev, [scope]: !prev[scope] }));
  }

  function sortMatches(matches: SearchMatch[]) {
    return [...matches].sort((a, b) => {
      const typeOrder = { code: 0, string: 1, class: 2 } as const;
      const typeDelta = typeOrder[a.type] - typeOrder[b.type];
      if (typeDelta !== 0) return typeDelta;

      const includedDelta = Number(b.includedByParatranz === true) - Number(a.includedByParatranz === true);
      if (includedDelta !== 0) return includedDelta;

      const datasetDelta = (a.dataset ?? '').localeCompare(b.dataset ?? '');
      if (datasetDelta !== 0) return datasetDelta;

      const lineDelta = (a.startLine ?? Number.MAX_SAFE_INTEGER) - (b.startLine ?? Number.MAX_SAFE_INTEGER);
      if (lineDelta !== 0) return lineDelta;

      return (a.value ?? a.matchedPath ?? '').localeCompare(b.value ?? b.matchedPath ?? '');
    });
  }

  function mergeMatches(matches: SearchMatch[]): DisplayMatch[] {
    const merged: DisplayMatch[] = [];
    const stringMap = new Map<string, DisplayMatch>();

    for (const match of matches) {
      if (match.type !== 'string') {
        merged.push(match);
        continue;
      }

      const key = `${match.startLine ?? 0}\0${match.value ?? ''}`;
      const existing = stringMap.get(key);
      if (!existing) {
        const next: DisplayMatch = {
          ...match,
          datasets: match.dataset ? [match.dataset] : [],
        };
        stringMap.set(key, next);
        merged.push(next);
        continue;
      }

      if (match.dataset && !existing.datasets?.includes(match.dataset)) {
        existing.datasets = [...(existing.datasets ?? []), match.dataset].sort();
      }
      existing.dataset = undefined;
    }

    return merged;
  }

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="搜索类名、字符串或代码..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="search-scope-row">
          <button
            type="button"
            className={`search-scope-btn${scopes.class ? ' active' : ''}`}
            aria-pressed={scopes.class}
            onClick={() => toggleScope('class')}
          >
            类名
          </button>
          <button
            type="button"
            className={`search-scope-btn${scopes.string ? ' active' : ''}`}
            aria-pressed={scopes.string}
            onClick={() => toggleScope('string')}
          >
            字符串
          </button>
          <button
            type="button"
            className={`search-scope-btn search-scope-btn-code${scopes.code ? ' active' : ''}`}
            aria-pressed={scopes.code}
            onClick={() => toggleScope('code')}
          >
            全文
          </button>
        </div>
      </div>

      <div className="search-results" ref={resultsRef}>
        {loading && <div className="search-hint">搜索中...</div>}

        {!loading && results === null && (
          <div className="search-hint">输入类名、字符串或代码片段进行搜索</div>
        )}

        {!loading && results !== null && results.length === 0 && (
          <div className="search-hint">无结果</div>
        )}

        {!loading && results !== null && results.map(group => {
          const key = `${group.jarName}\0${group.sourcePath}`;
          const isCollapsed = collapsed.has(key);
          const fileName = group.sourcePath.split('/').pop() ?? group.sourcePath;
          const detailMatches = mergeMatches(sortMatches(group.matches.filter(m => m.type !== 'class')));

          return (
            <div key={key} className="search-group">
              <div
                className="search-group-header"
                onClick={() => onNavigate(group.jarName, group.sourcePath)}
              >
                {detailMatches.length > 0 ? (
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
                  <span className="search-group-name">{highlightMatch(fileName, query)}</span>
                  <span className="search-group-path">{highlightMatch(group.sourcePath, query)}</span>
                </div>
                {detailMatches.length > 0 && (
                  <span className="search-group-count">{detailMatches.length}</span>
                )}
              </div>

              {!isCollapsed && detailMatches.map((m, i) => (
                <div
                  key={`${m.type}-${(m.datasets ?? [m.dataset ?? 'none']).join('-')}-${m.startLine ?? 0}-${m.utf8Index ?? i}-${i}`}
                  className="search-match-item"
                  onClick={() => onNavigate(
                    group.jarName,
                    group.sourcePath,
                    m.startLine,
                    m.type === 'code' || (m.datasets?.length ?? 0) > 1 ? undefined : m.dataset
                  )}
                >
                  {m.type !== 'code' && (m.datasets ?? (m.dataset ? [m.dataset] : [])).map(dataset => (
                    <span key={dataset} className={`dataset-badge ${dataset}`}>
                      {dataset === 'original' ? '原' : '译'}
                    </span>
                  ))}
                  <span
                    className={`search-match-value${m.includedByParatranz ? ' search-match-value-extracted' : ''}`}
                    title={m.snippet ?? m.value ?? m.matchedPath}
                  >
                    {highlightMatch(m.snippet ?? m.value ?? m.matchedPath ?? '—', query)}
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
