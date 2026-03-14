'use client';

import { useEffect, useCallback, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import CodeViewer from '@/components/CodeViewer';
import {
  MessageType,
  PROTOCOL_NAME,
  ALLOWED_ORIGINS,
  type AppMessage,
  type NavigatePayload,
} from '@/lib/protocol';

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

  const jarName = pathSegments?.[0] ? decodeURIComponent(pathSegments[0]) : '';
  const className = pathSegments ? pathSegments.slice(1).join('/') : '';

  // 有文件 URL 时初始就进入加载态，避免短暂闪出欢迎文字
  const [state, setState] = useState<ViewerState>(() => ({
    ...INITIAL_STATE,
    loading: !!(pathSegments && pathSegments.length > 1),
  }));

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

  useEffect(() => {
    if (jarName && className) {
      loadFile(dataset, jarName, className, stringId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, jarName, className, stringId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      const msg = event.data as AppMessage;
      if (msg?.protocol !== PROTOCOL_NAME) return;
      if (msg.type !== MessageType.PT_NAVIGATE_TO_STRING) return;

      const { dataset: ds, jarName: jar, className: cls, stringId: sid } =
        msg.payload as NavigatePayload;

      const javaPath = cls.replace(/\.class$/, '.java');
      router.push(
        `/viewer/${ds}/${encodeURIComponent(jar)}/${javaPath}?stringId=${encodeURIComponent(sid)}`
      );
    }

    window.addEventListener('message', handleMessage);

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
    <>
      <header className="header">
        <div className="header-breadcrumb">
          {state.jarName && <>
            <span className="header-breadcrumb-jar">{state.jarName}</span>
            <span className="header-breadcrumb-sep">›</span>
          </>}
          <span className="header-breadcrumb-class">
            {state.className || '欢迎'}
          </span>
        </div>

        <span className={`dataset-badge ${dataset}`}>
          {dataset.toUpperCase()}
        </span>
      </header>

      <main className="code-container">
        {state.loading && <div className="code-loading">加载中...</div>}
        <CodeViewer
          code={state.code}
          lang={state.lang}
          highlightLines={state.highlightLines}
        />
      </main>
    </>
  );
}
