'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { JarInfo, FileInfo } from '@/lib/types';

// ─── Tree node types ───────────────────────────────────────────────────────────

interface JarNode {
  kind: 'jar';
  jarName: string;
  name: string;
  hasOriginal: boolean;
  hasLocalization: boolean;
  level: 0;
}

interface DirNode {
  kind: 'dir';
  path: string;
  name: string;
  jarName: string;
  level: number;
}

interface FileNode {
  kind: 'file';
  path: string;
  name: string;
  jarName: string;
  hasOriginal: boolean;
  hasLocalization: boolean;
  level: number;
}

type TreeNode = JarNode | DirNode | FileNode;

// ─── Build flat visible list ───────────────────────────────────────────────────

function buildFlatList(
  jars: JarInfo[],
  expandedJars: Set<string>,
  expandedDirs: Map<string, Set<string>>,
  filesByJar: Map<string, FileInfo[]>,
): TreeNode[] {
  const result: TreeNode[] = [];

  for (const jar of jars) {
    result.push({
      kind: 'jar',
      jarName: jar.jarName,
      name: jar.name,
      hasOriginal: jar.hasOriginal,
      hasLocalization: jar.hasLocalization,
      level: 0,
    });

    if (!expandedJars.has(jar.jarName)) continue;

    const files = filesByJar.get(jar.jarName);
    if (!files) continue;

    const expanded = expandedDirs.get(jar.jarName) ?? new Set<string>();

    // Build directory tree inline
    type DirEntry = { children: Map<string, DirEntry>; files: FileInfo[] };
    const root: DirEntry = { children: new Map(), files: [] };

    for (const f of files) {
      const parts = f.path.split('/');
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!cur.children.has(seg)) {
          cur.children.set(seg, { children: new Map(), files: [] });
        }
        cur = cur.children.get(seg)!;
      }
      cur.files.push(f);
    }

    function walk(entry: DirEntry, pathPrefix: string, level: number) {
      for (const [dirName, sub] of entry.children) {
        const fullPath = pathPrefix ? `${pathPrefix}/${dirName}` : dirName;
        result.push({ kind: 'dir', path: fullPath, name: dirName, jarName: jar.jarName, level });
        if (expanded.has(fullPath)) {
          walk(sub, fullPath, level + 1);
        }
      }
      for (const f of entry.files) {
        const parts = f.path.split('/');
        result.push({
          kind: 'file',
          path: f.path,
          name: parts[parts.length - 1],
          jarName: jar.jarName,
          hasOriginal: f.hasOriginal,
          hasLocalization: f.hasLocalization,
          level,
        });
      }
    }

    walk(root, '', 1);
  }

  return result;
}

// ─── FileTree component ────────────────────────────────────────────────────────

interface Props {
  activeJar: string;
  activeFile: string;
  onSelect: (jarName: string, filePath: string) => void;
  /** When set, auto-expand + scroll to this path once, then reset */
  autoNavigateTo?: { jarName: string; filePath: string } | null;
  onAutoNavigateDone?: () => void;
}

export default function FileTree({ activeJar, activeFile, onSelect, autoNavigateTo, onAutoNavigateDone }: Props) {
  const [jars, setJars] = useState<JarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJars, setExpandedJars] = useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = useState<Map<string, Set<string>>>(new Map());
  const [filesByJar, setFilesByJar] = useState<Map<string, FileInfo[]>>(new Map());
  const [loadingJar, setLoadingJar] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const filesByJarRef = useRef(filesByJar);
  filesByJarRef.current = filesByJar;
  const pendingScrollRef = useRef<{ jarName: string; filePath: string } | null>(null);
  const accumulated = useRef(0);

  // Row height matches virtualizer estimateSize
  const ROW_H = 22;
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= ROW_H;
      if (e.deltaMode === 2) px *= el!.clientHeight;
      accumulated.current += px;
      const steps = Math.trunc(accumulated.current / ROW_H);
      if (steps !== 0) {
        el!.scrollTop += steps * ROW_H;
        accumulated.current -= steps * ROW_H;
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loading]);

  // Load jar list
  useEffect(() => {
    fetch('/api/files/tree')
      .then(r => r.json())
      .then((d: { jars: JarInfo[] }) => setJars(d.jars ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const loadJarFiles = useCallback(async (jarName: string) => {
    if (filesByJarRef.current.has(jarName)) return;
    setLoadingJar(jarName);
    try {
      const r = await fetch(`/api/files/tree?jar=${encodeURIComponent(jarName)}`);
      const d: { files: FileInfo[] } = await r.json();
      setFilesByJar(prev => new Map(prev).set(jarName, d.files ?? []));
    } finally {
      setLoadingJar(null);
    }
  }, []);

  // Auto-navigate (from ParaTranz or direct URL)
  useEffect(() => {
    if (!autoNavigateTo) return;
    const { jarName, filePath } = autoNavigateTo;

    async function go() {
      await loadJarFiles(jarName);
      setExpandedJars(prev => new Set(prev).add(jarName));

      // Expand all parent dirs — loop up to parts.length so the immediate parent is included
      const parts = filePath.split('/');
      const dirsToExpand: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        dirsToExpand.push(parts.slice(0, i).join('/'));
      }
      if (dirsToExpand.length > 0) {
        setExpandedDirs(prev => {
          const next = new Map(prev);
          const set = new Set(next.get(jarName) ?? []);
          for (const d of dirsToExpand) set.add(d);
          next.set(jarName, set);
          return next;
        });
      }

      // Mark scroll target — will fire after items are rebuilt
      pendingScrollRef.current = { jarName, filePath };
      onAutoNavigateDone?.();
    }

    void go();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNavigateTo]);

  async function toggleJar(jarName: string) {
    if (expandedJars.has(jarName)) {
      setExpandedJars(prev => { const s = new Set(prev); s.delete(jarName); return s; });
    } else {
      await loadJarFiles(jarName);
      setExpandedJars(prev => new Set(prev).add(jarName));
    }
  }

  function toggleDir(jarName: string, dirPath: string) {
    setExpandedDirs(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(jarName) ?? []);
      if (set.has(dirPath)) set.delete(dirPath); else set.add(dirPath);
      next.set(jarName, set);
      return next;
    });
  }

  const items = buildFlatList(jars, expandedJars, expandedDirs, filesByJar);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  // Scroll to pending target once the item appears in the rebuilt list
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (!target) return;
    const idx = items.findIndex(
      n => n.kind === 'file' && n.jarName === target.jarName && n.path === target.filePath
    );
    if (idx >= 0) {
      pendingScrollRef.current = null;
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'auto' });
    }
  });

  if (loading) return <div className="search-hint">正在加载...</div>;
  if (jars.length === 0) return <div className="search-hint">暂无数据</div>;

  return (
    <div ref={parentRef} className="file-tree">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vi => {
          const node = items[vi.index];
          const isActive =
            node.kind === 'file' &&
            node.jarName === activeJar &&
            node.path === activeFile;

          const indent = node.level * 12 + 8;

          if (node.kind === 'jar') {
            const isExpanded = expandedJars.has(node.jarName);
            const isJarActive = node.jarName === activeJar;
            return (
              <div
                key={vi.key}
                className={`tree-row tree-row-jar${isJarActive ? ' active' : ''}`}
                style={{ position: 'absolute', top: vi.start, height: vi.size, paddingLeft: indent }}
                onClick={() => void toggleJar(node.jarName)}
              >
                <span className="tree-expand">{isExpanded ? '▾' : '▸'}</span>
                <span className="tree-icon">📦</span>
                <span className="tree-name">{node.name}</span>
                {loadingJar === node.jarName && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>...</span>
                )}
              </div>
            );
          }

          if (node.kind === 'dir') {
            const isExpanded = (expandedDirs.get(node.jarName) ?? new Set()).has(node.path);
            return (
              <div
                key={vi.key}
                className="tree-row"
                style={{ position: 'absolute', top: vi.start, height: vi.size, paddingLeft: indent }}
                onClick={() => toggleDir(node.jarName, node.path)}
              >
                <span className="tree-expand">{isExpanded ? '▾' : '▸'}</span>
                <span className="tree-icon" style={{ fontSize: 12 }}>📁</span>
                <span className="tree-name">{node.name}</span>
              </div>
            );
          }

          // file
          return (
            <div
              key={vi.key}
              className={`tree-row${isActive ? ' active' : ''}`}
              style={{ position: 'absolute', top: vi.start, height: vi.size, paddingLeft: indent }}
              onClick={() => onSelect(node.jarName, node.path)}
            >
              <span className="tree-expand" />
              <span className="tree-icon" style={{ fontSize: 12 }}>📄</span>
              <span className="tree-name">{node.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
