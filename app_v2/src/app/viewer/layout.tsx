'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import FileTree from '@/components/FileTree';
import SearchPanel from '@/components/SearchPanel';
import StatusFooterBar from '@/components/StatusFooterBar';
import {
  ALLOWED_ORIGINS, MessageType, PROTOCOL_NAME,
  type AppMessage, type NavigateToStringPayload,
} from '@/lib/protocol';
import type { Dataset } from '@/lib/types';

const SIDEBAR_KEY = 'ssfb:sidebar-width';
const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 560;
const DEFAULT_SIDEBAR = 260;

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

type Tab = 'explorer' | 'search';

interface AutoNavigate {
  jarName: string;
  filePath: string;
}

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>('explorer');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [autoNavigate, setAutoNavigate] = useState<AutoNavigate | null>(null);

  // Derive activeJar/activeFile directly from the URL — always in sync
  const { activeJar, activeFile } = useMemo(() => {
    const after = pathname.split('/viewer/')[1] ?? '';
    const parts = after.split('/').filter(Boolean);
    return {
      activeJar: parts[0] ? decodeURIComponent(parts[0]) : '',
      activeFile: parts.slice(1).map(p => decodeURIComponent(p)).join('/'),
    };
  }, [pathname]);

  const layoutRef = useRef<HTMLDivElement>(null);

  // Restore sidebar width
  useEffect(() => {
    try {
      const w = parseInt(localStorage.getItem(SIDEBAR_KEY) ?? '', 10);
      if (!isNaN(w)) setSidebarWidth(clamp(w, MIN_SIDEBAR, MAX_SIDEBAR));
    } catch { /* */ }
  }, []);

  // Auto-expand tree on initial page load if URL already has a file path
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (activeJar && activeFile) {
      setAutoNavigate({ jarName: activeJar, filePath: activeFile });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  // Sidebar resizer
  function onSidebarDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const layout = layoutRef.current;
    if (!layout) return;
    const layoutLeft = layout.getBoundingClientRect().left;

    function onMove(mv: PointerEvent) {
      setSidebarWidth(clamp(mv.clientX - layoutLeft, MIN_SIDEBAR, MAX_SIDEBAR));
    }
    function onUp(up: PointerEvent) {
      const w = clamp(up.clientX - layoutLeft, MIN_SIDEBAR, MAX_SIDEBAR);
      setSidebarWidth(w);
      try { localStorage.setItem(SIDEBAR_KEY, String(w)); } catch { /* */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ParaTranz message handler
  useEffect(() => {
    async function sendReady() {
      if (!window.opener) return;
      let revision = '';
      try {
        const r = await fetch('/api/meta');
        if (r.ok) { const d = await r.json(); revision = d.revision ?? ''; }
      } catch { /* */ }
      window.opener.postMessage({
        protocol: PROTOCOL_NAME,
        type: MessageType.FB_READY,
        requestId: crypto.randomUUID(),
        payload: { connected: true, appOrigin: window.location.origin, revision },
      }, 'https://paratranz.cn');
    }

    function handleMessage(ev: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(ev.origin)) return;
      const msg = ev.data as AppMessage;
      if (msg?.protocol !== PROTOCOL_NAME) return;
      if (msg.type !== MessageType.PT_NAVIGATE_TO_STRING) return;

      const payload = msg.payload as NavigateToStringPayload;
      // Normalize class to outer .java path
      const sourcePath = payload.className
        .replace(/\$[^/]+(?=\.(class|java)$)/, '')
        .replace(/\.class$/, '.java');

      // Extract inner class suffix for query param
      const subclassMatch = payload.className.match(/\$([^/]+)(?=\.(class|java)$)/);
      const subclass = subclassMatch?.[1];

      const query = new URLSearchParams({ utf8ConstId: payload.utf8ConstId });
      if (subclass) query.set('subclass', subclass);

      const url = `/viewer/${encodeURIComponent(payload.jarName)}/${sourcePath}?${query}`;
      router.push(url);

      setAutoNavigate({ jarName: payload.jarName, filePath: sourcePath });
      setTab('explorer');
    }

    window.addEventListener('message', handleMessage);
    void sendReady();
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  const handleSelect = useCallback((jarName: string, filePath: string) => {
    router.push(`/viewer/${encodeURIComponent(jarName)}/${filePath}`);
  }, [router]);

  const handleSearchNavigate = useCallback((jarName: string, filePath: string, startLine?: number, dataset?: Dataset) => {
    const query = new URLSearchParams();
    if (startLine) query.set('highlightLine', String(startLine));
    if (dataset) query.set('preferredDataset', dataset);
    query.set('nav', String(Date.now()));
    const qs = query.toString();
    const url = qs
      ? `/viewer/${encodeURIComponent(jarName)}/${filePath}?${qs}`
      : `/viewer/${encodeURIComponent(jarName)}/${filePath}`;
    router.push(url);
    setAutoNavigate({ jarName, filePath });
  }, [router]);

  return (
    <div className="app-shell">
      <div ref={layoutRef} className="app-body">
        {/* Sidebar */}
        <aside
          className="sidebar"
          style={{ width: sidebarWidth, minWidth: sidebarWidth }}
        >
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab${tab === 'explorer' ? ' active' : ''}`}
              onClick={() => setTab('explorer')}
            >
              <span aria-hidden="true">📁</span>
              <span>资源管理器</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab${tab === 'search' ? ' active' : ''}`}
              onClick={() => setTab('search')}
            >
              <span aria-hidden="true">🔍</span>
              <span>搜索</span>
            </button>
          </div>

          <div className="sidebar-content">
            <div className={`sidebar-panel${tab !== 'explorer' ? ' sidebar-panel-hidden' : ''}`}>
              <FileTree
                activeJar={activeJar}
                activeFile={activeFile}
                onSelect={handleSelect}
                autoNavigateTo={autoNavigate}
                onAutoNavigateDone={() => setAutoNavigate(null)}
              />
            </div>
            <div className={`sidebar-panel${tab !== 'search' ? ' sidebar-panel-hidden' : ''}`}>
              <SearchPanel onNavigate={handleSearchNavigate} />
            </div>
          </div>
        </aside>

        {/* Sidebar resizer */}
        <div className="sidebar-resizer" onPointerDown={onSidebarDragStart} />

        {/* Main */}
        {children}
      </div>

      <StatusFooterBar />
    </div>
  );
}
