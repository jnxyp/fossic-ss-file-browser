'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SidebarPanel from '@/components/SidebarPanel';
import StatusFooterBar from '@/components/StatusFooterBar';

const SIDEBAR_WIDTH_STORAGE_KEY = 'ssfb:sidebar-width';
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 280;

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const dataset = params.dataset as string;
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frameId = 0;

    try {
      const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (!storedWidth) {
        return;
      }

      const parsedWidth = Number.parseInt(storedWidth, 10);
      if (!Number.isNaN(parsedWidth)) {
        frameId = window.requestAnimationFrame(() => {
          setSidebarWidth(clampSidebarWidth(parsedWidth));
        });
      }
    } catch {
      // Ignore localStorage read failures.
    }

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  function handleResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    const layoutElement = layoutRef.current;
    if (!layoutElement) {
      return;
    }

    event.preventDefault();

    const layoutLeft = layoutElement.getBoundingClientRect().left;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = clampSidebarWidth(moveEvent.clientX - layoutLeft);
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp(upEvent: PointerEvent) {
      const nextWidth = clampSidebarWidth(upEvent.clientX - layoutLeft);
      setSidebarWidth(nextWidth);

      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
      } catch {
        // Ignore localStorage write failures.
      }

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  return (
    <div className="app-shell">
      <div ref={layoutRef} className="layout-container">
        <div
          className="sidebar-shell"
          style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}
        >
          <SidebarPanel dataset={dataset} />
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整文件树宽度"
          onPointerDown={handleResizeStart}
        />
        <div className="main-content">
          {children}
        </div>
      </div>
      <StatusFooterBar />
    </div>
  );
}
