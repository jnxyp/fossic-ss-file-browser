'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import CodeViewer from '@/components/CodeViewer';
import {
  ALLOWED_ORIGINS,
  MessageType,
  PROTOCOL_NAME,
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
  code: '// 请在左侧选择文件，或从 ParaTranz 发起定位请求',
  lang: 'text',
  highlightLines: [],
  jarName: '',
  className: '',
  loading: false,
};

function normalizeClassPath(className: string) {
  return className.replace(/\$[^/]+(?=\.class$|\.java$)/, '');
}

function getSubclassSuffix(className: string) {
  const match = className.match(/\$([^/]+)(?=\.class$|\.java$)/);
  return match?.[1] ?? '';
}

function buildTargetClassName(sourceClassName: string, subclass?: string) {
  if (!subclass) {
    return sourceClassName;
  }

  const extensionMatch = sourceClassName.match(/\.(class|java)$/);
  if (!extensionMatch) {
    return `${sourceClassName}$${subclass}`;
  }

  const extension = extensionMatch[1];
  const baseClassName = sourceClassName.slice(0, -extension.length - 1);
  return `${baseClassName}$${subclass}.${extension}`;
}

export default function ViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const dataset = params.dataset as string;
  const pathSegments = params.path as string[] | undefined;
  const utf8ConstId = searchParams.get('utf8ConstId') ?? undefined;
  const subclass = searchParams.get('subclass') ?? undefined;

  const jarName = pathSegments?.[0] ? decodeURIComponent(pathSegments[0]) : '';
  const sourceClassName = pathSegments
    ? pathSegments.slice(1).map(segment => decodeURIComponent(segment)).join('/')
    : '';
  const targetClassName = buildTargetClassName(sourceClassName, subclass ?? undefined);

  const [state, setState] = useState<ViewerState>(() => ({
    ...INITIAL_STATE,
    loading: Boolean(pathSegments && pathSegments.length > 1),
  }));
  const [copied, setCopied] = useState(false);

  const loadContent = useCallback(async (
    ds: string,
    jar: string,
    sourceCls: string,
  ) => {
    if (!jar || !sourceCls) {
      return;
    }

    setState(prev => ({ ...prev, loading: true }));

    const contentResponse = await fetch(
      `/api/files/content?dataset=${ds}&jar=${encodeURIComponent(jar)}&class=${encodeURIComponent(sourceCls)}`
    );

    if (!contentResponse.ok) {
      setState(prev => ({
        ...prev,
        code: `// 错误：无法加载 ${jar} / ${sourceCls}`,
        lang: 'text',
        jarName: jar,
        loading: false,
      }));
      return;
    }

    const { content } = await contentResponse.json();
    const lang = sourceCls.endsWith('.java') || sourceCls.endsWith('.class') ? 'java' : 'text';

    setState(prev => ({
      ...prev,
      code: content,
      lang,
      jarName: jar,
      loading: false,
    }));
  }, []);

  useEffect(() => {
    if (jarName && sourceClassName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadContent(dataset, jarName, sourceClassName);
    }
  }, [dataset, jarName, loadContent, sourceClassName]);

  useEffect(() => {
    async function loadHighlightLines() {
      if (!jarName || !targetClassName) {
        return;
      }

      let nextHighlightLines: number[] = [];
      if (utf8ConstId) {
        const indexResponse = await fetch(
          `/api/files/index?dataset=${dataset}&jar=${encodeURIComponent(jarName)}&class=${encodeURIComponent(targetClassName)}&utf8ConstId=${encodeURIComponent(utf8ConstId)}`
        );
        if (indexResponse.ok) {
          const data = await indexResponse.json();
          nextHighlightLines = data.lines ?? [];
        }
      }

      setState(prev => ({
        ...prev,
        highlightLines: nextHighlightLines,
        jarName,
        className: targetClassName,
      }));
    }

    void loadHighlightLines();
  }, [dataset, jarName, targetClassName, utf8ConstId]);

  useEffect(() => {
    async function sendReadyMessage() {
      if (!window.opener) {
        return;
      }

      let revision = '';
      try {
        const response = await fetch('/api/manifest');
        if (response.ok) {
          const manifest = await response.json() as { revision?: string };
          revision = manifest.revision ?? '';
        }
      } catch {
        // Ignore transient manifest fetch failures for handshake.
      }

      window.opener.postMessage(
        {
          protocol: PROTOCOL_NAME,
          type: MessageType.FB_READY,
          requestId: crypto.randomUUID(),
          payload: {
            connected: true,
            appOrigin: window.location.origin,
            dataset,
            revision,
          },
        },
        'https://paratranz.cn'
      );
    }

    function handleMessage(event: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        return;
      }

      const message = event.data as AppMessage;
      if (message?.protocol !== PROTOCOL_NAME) {
        return;
      }

      if (message.type !== MessageType.PT_NAVIGATE_TO_STRING) {
        return;
      }

      const payload = message.payload as NavigatePayload;
      const sourceJavaPath = normalizeClassPath(payload.className).replace(/\.class$/, '.java');
      const targetJavaPath = payload.className.replace(/\.class$/, '.java');
      const query = new URLSearchParams({
        utf8ConstId: payload.utf8ConstId,
      });
      const subclassSuffix = getSubclassSuffix(targetJavaPath);
      if (subclassSuffix) {
        query.set('subclass', subclassSuffix);
      }
      router.push(
        `/viewer/${dataset}/${encodeURIComponent(payload.jarName)}/${sourceJavaPath}?${query.toString()}`
      );
    }

    window.addEventListener('message', handleMessage);

    void sendReadyMessage();

    return () => window.removeEventListener('message', handleMessage);
  }, [dataset, router]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopyLocator() {
    if (!state.jarName || !state.className) {
      return;
    }

    const normalizedClassName = state.className.replace(/\.java$/, '');
    await navigator.clipboard.writeText(`${state.jarName}:${normalizedClassName}`);
    setCopied(true);
  }

  const datasetLabel = dataset === 'original' ? '原文' : '译文';

  return (
    <>
      <header className="header">
        <div className="header-breadcrumb">
          {state.jarName ? (
            <>
              <span className="header-breadcrumb-jar">{state.jarName}</span>
              <span className="header-breadcrumb-sep">/</span>
            </>
          ) : null}

          <span className="header-breadcrumb-class">
            {state.className || '欢迎'}
          </span>

          <button
            type="button"
            className={`copy-icon-button ${copied ? 'copied' : ''}`}
            onClick={() => void handleCopyLocator()}
            disabled={!state.jarName || !state.className}
            title={copied ? '已复制' : '复制定位'}
            aria-label={copied ? '已复制定位' : '复制定位'}
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>

        <div className="header-actions">
          <span className={`dataset-badge ${dataset}`}>
            {datasetLabel}
          </span>
        </div>
      </header>

      <main className="code-container">
        {state.loading ? <div className="code-loading">加载中...</div> : null}
        <CodeViewer
          code={state.code}
          lang={state.lang}
          highlightLines={state.highlightLines}
        />
      </main>
    </>
  );
}
