'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
const ViewerArea = dynamic(() => import('@/components/ViewerArea'), { ssr: false });
import {
  ALLOWED_ORIGINS, MessageType, PROTOCOL_NAME,
  type NavigateToParatranzPayload,
} from '@/lib/protocol';
import type { StringEntry, Dataset } from '@/lib/types';


export default function ViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const segments = params.segments as string[] | undefined;
  const jarName = segments?.[0] ? decodeURIComponent(segments[0]) : '';
  const filePath = segments && segments.length > 1
    ? segments.slice(1).map(s => decodeURIComponent(s)).join('/')
    : '';

  const utf8ConstId = searchParams.get('utf8ConstId') ?? undefined;
  const subclass = searchParams.get('subclass') ?? undefined;
  const highlightLineParam = searchParams.get('highlightLine');
  const preferredDatasetParam = searchParams.get('preferredDataset');
  const navigationToken = searchParams.get('nav') ?? undefined;
  const preferredDataset = preferredDatasetParam === 'original' || preferredDatasetParam === 'localization'
    ? preferredDatasetParam
    : undefined;

  // Target class includes inner class suffix when present
  const targetClass = subclass && filePath
    ? filePath.replace(/\.java$/, `$${subclass}.java`)
    : filePath;

  const activeUtf8Index = utf8ConstId ? parseInt(utf8ConstId.replace('#', ''), 10) : undefined;
  const activeConstTable = subclass ? `$${subclass}` : '';

  const [highlightLines, setHighlightLines] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);

  // Resolve highlight lines from utf8ConstId
  useEffect(() => {
    if (highlightLineParam) {
      const n = parseInt(highlightLineParam, 10);
      setHighlightLines(isNaN(n) ? [] : [n]);
      return;
    }
    if (!jarName || !targetClass || !utf8ConstId) {
      setHighlightLines([]);
      return;
    }

    // Determine which datasets to query based on mode (best-effort: try localization first)
    const query = new URLSearchParams({
      jar: jarName,
      class: targetClass,
      dataset: 'localization',
      utf8ConstId,
    });

    fetch(`/api/files/index?${query}`)
      .then(r => r.ok ? r.json() : { lines: [] })
      .then((d: { lines: number[] }) => {
        if (d.lines.length > 0) { setHighlightLines(d.lines); return; }
        // Fallback to original
        query.set('dataset', 'original');
        return fetch(`/api/files/index?${query}`)
          .then(r2 => r2.ok ? r2.json() : { lines: [] })
          .then((d2: { lines: number[] }) => setHighlightLines(d2.lines ?? []));
      })
      .catch(() => setHighlightLines([]));
  }, [jarName, targetClass, utf8ConstId, highlightLineParam]);

  // Copy locator
  async function handleCopy() {
    if (!jarName || !targetClass) return;
    const cls = targetClass.replace(/\.java$/, '');
    await navigator.clipboard.writeText(`${jarName}:${cls}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  // Click on a string → send FB_NAVIGATE_TO_PARATRANZ_STRING
  const handleClickEntry = useCallback((entry: StringEntry, dataset: Dataset) => {
    if (!window.opener) return;
    const ownerClass = entry.ownerClassName;
    const locator = `${jarName}:${ownerClass}`;
    const payload: NavigateToParatranzPayload = {
      locator,
      value: entry.value,
      utf8ConstId: `#${entry.utf8Index}`,
      dataset,
    };
    window.opener.postMessage(
      { protocol: PROTOCOL_NAME, type: MessageType.FB_NAVIGATE_TO_PARATRANZ_STRING, requestId: crypto.randomUUID(), payload },
      ALLOWED_ORIGINS[0]
    );
  }, [jarName]);

  // /api/files/index route (used by ViewerArea fallback above)
  // NOTE: we also need to expose this API route for index lookups
  // The route is already created at api/files/index/route.ts

  const fileName = filePath.split('/').pop() ?? '';

  return (
    <div className="main-area">
      {/* Header */}
      <header className="viewer-header">
        <div className="breadcrumb">
          {jarName && <span className="breadcrumb-jar" title={jarName}>{jarName}</span>}
          {jarName && filePath && <span className="breadcrumb-sep">:</span>}
          {filePath && <span className="breadcrumb-file" title={filePath}>{filePath}</span>}
          {filePath && (
            <button
              type="button"
              className={`icon-btn${copied ? ' active' : ''}`}
              title={copied ? '已复制' : '复制类名定位符'}
              onClick={() => void handleCopy()}
            >
              {copied ? '✓' : '⧉'}
            </button>
          )}
          {!jarName && <span className="breadcrumb-welcome">欢迎</span>}
        </div>
      </header>

      {/* Viewer */}
      <ViewerArea
        jarName={jarName}
        filePath={filePath}
        targetClass={targetClass}
        activeUtf8Index={activeUtf8Index}
        activeConstTable={activeConstTable}
        preferredDataset={preferredDataset}
        navigationToken={navigationToken}
        highlightLines={highlightLines}
        onClickEntry={handleClickEntry}
      />
    </div>
  );
}
