'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import CodeViewer from '@/components/CodeViewer';
import Sidebar from '@/components/Sidebar';
import {
  MessageType,
  PROTOCOL_NAME,
  ALLOWED_ORIGINS,
  type AppMessage,
  type NavigatePayload,
} from '@/lib/protocol';
import { useState } from 'react';

interface ViewerState {
  code: string;
  lang: string;
  highlightLines: number[];
  jarName: string;
  className: string;
  loading: boolean;
}

const INITIAL_STATE: ViewerState = {
  code: '// 请在左侧选择文件包，或从 ParaTranz 发起导航请求',
  lang: 'text',
  highlightLines: [],
  jarName: '',
  className: '',
  loading: false,
};

export default function ViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const dataset = params.dataset as string;
  const pathSegments = params.path as string[] | undefined;
  const stringId = searchParams.get('stringId') ?? undefined;

  // 从 URL 推导当前文件
  const jarName = pathSegments?.[0] ? decodeURIComponent(pathSegments[0]) : '';
  const className = pathSegments ? pathSegments.slice(1).join('/') : '';

  const [state, setState] = useState<ViewerState>(INITIAL_STATE);

  // 加载文件内容（+ 可选的行索引查询）
  const loadFile = useCallback(async (
    ds: string,
    jar: string,
    cls: string,
    sid?: string,
  ) => {
    if (!jar || !cls) return;

    setState(prev => ({ ...prev, loading: true }));

    const contentRes = await fetch(
      `/api/files/content?dataset=${ds}&jar=${encodeURIComponent(jar)}&class=${encodeURIComponent(cls)}`
    );

    if (!contentRes.ok) {
      setState(prev => ({
        ...prev,
        code: `// 错误：无法加载 ${jar} / ${cls}`,
        lang: 'text',
        highlightLines: [],
        jarName: jar,
        className: cls,
        loading: false,
      }));
      return;
    }

    const { content } = await contentRes.json();
    const lang = cls.endsWith('.java') || cls.endsWith('.class') ? 'java' : 'text';

    let highlightLines: number[] = [];
    if (sid) {
      const idxRes = await fetch(
        `/api/files/index?dataset=${ds}&jar=${encodeURIComponent(jar)}&class=${encodeURIComponent(cls)}&stringId=${encodeURIComponent(sid)}`
      );
      if (idxRes.ok) {
        const data = await idxRes.json();
        highlightLines = data.lines ?? [];
      }
    }

    setState({ code: content, lang, highlightLines, jarName: jar, className: cls, loading: false });
  }, []);

  // URL 变化时加载文件（侧边栏点击）
  useEffect(() => {
    if (jarName && className) {
      loadFile(dataset, jarName, className, stringId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, jarName, className, stringId]);

  // postMessage 监听 + 发送 FB_READY
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      const msg = event.data as AppMessage;
      if (msg?.protocol !== PROTOCOL_NAME) return;
      if (msg.type !== MessageType.PT_NAVIGATE_TO_STRING) return;

      const { dataset: ds, jarName: jar, className: cls, stringId: sid } =
        msg.payload as NavigatePayload;

      // 规范化为 .java 路径（CFR 反编译产物）
      const javaPath = cls.replace(/\.class$/, '.java');

      router.push(
        `/viewer/${ds}/${encodeURIComponent(jar)}/${javaPath}?stringId=${encodeURIComponent(sid)}`
      );
    }

    window.addEventListener('message', handleMessage);

    // 通知 ParaTranz 浏览器已就绪
    if (window.opener) {
      window.opener.postMessage(
        {
          protocol: PROTOCOL_NAME,
          type: MessageType.FB_READY,
          requestId: crypto.randomUUID(),
          payload: { connected: true, appOrigin: window.location.origin },
        },
        'https://paratranz.cn'
      );
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  return (
    <div className="layout-container">
      <Sidebar dataset={dataset} />

      <div className="main-content">
        <header className="header">
          <div style={{ fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ opacity: 0.5 }}>{state.jarName}</span>
            {state.className && <span style={{ opacity: 0.5 }}>/</span>}
            <span style={{ color: 'var(--accent-color)' }}>{state.className}</span>
            {state.loading && (
              <span style={{ opacity: 0.4, fontSize: '12px' }}>加载中...</span>
            )}
          </div>

          <div style={{
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: dataset === 'original' ? '#30363d' : '#23863633',
            color: dataset === 'original' ? '#c9d1d9' : '#3fb950',
            border: '1px solid #30363d',
            fontWeight: 600,
          }}>
            {dataset.toUpperCase()}
          </div>
        </header>

        <main className="code-container">
          <CodeViewer
            code={state.code}
            lang={state.lang}
            highlightLines={state.highlightLines}
          />
        </main>
      </div>
    </div>
  );
}
