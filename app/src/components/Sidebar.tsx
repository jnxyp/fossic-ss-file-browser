'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import type { Manifest } from '@/lib/manifest';

// ─── Tree types ──────────────────────────────────────────────────────────────

interface DirNode {
  kind: 'dir';
  name: string;
  path: string; // relative from jar root, e.g. "com/fs"
  children: TreeNode[];
}

interface FileNode {
  kind: 'file';
  name: string;
  path: string; // full path, e.g. "com/fs/Foo.java"
}

type TreeNode = DirNode | FileNode;

function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (isFile) {
        current.push({ kind: 'file', name, path: filePath });
      } else {
        let dir = current.find(
          (n): n is DirNode => n.kind === 'dir' && n.name === name
        );
        if (!dir) {
          dir = { kind: 'dir', name, path: currentPath, children: [] };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }

  return root;
}

// ─── Recursive tree item ──────────────────────────────────────────────────────

function TreeItem({
  node,
  dataset,
  jarPath,
  activeClass,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode;
  dataset: string;
  jarPath: string;
  activeClass: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  if (node.kind === 'file') {
    const href = `/viewer/${dataset}/${encodeURIComponent(jarPath)}/${node.path}`;
    const isActive = node.path === activeClass;
    return (
      <Link
        href={href}
        className={`tree-node tree-node-file ${isActive ? 'active' : ''}`}
        title={node.path}
      >
        <span className="icon">📄</span>
        <span className="tree-node-name">{node.name}</span>
      </Link>
    );
  }

  const isExpanded = expandedDirs.has(node.path);
  return (
    <div>
      <div
        className="tree-node tree-node-dir"
        onClick={() => onToggleDir(node.path)}
      >
        <span className="tree-expand-icon">{isExpanded ? '▾' : '▸'}</span>
        <span className="tree-node-name">{node.name}</span>
      </div>
      {isExpanded && (
        <div className="tree-dir-children">
          {node.children.map(child => (
            <TreeItem
              key={child.path}
              node={child}
              dataset={dataset}
              jarPath={jarPath}
              activeClass={activeClass}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface JarItem {
  name: string;
  path: string;
}

function formatRevision(rev: string): string {
  if (!rev || rev === 'initial') return '—';
  return rev.substring(0, 8);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function Sidebar({ dataset }: { dataset: string }) {
  // 从 URL 读取当前位置
  const params = useParams();
  const searchParams = useSearchParams();
  const pathSegments = params.path as string[] | undefined;
  const jarName = pathSegments?.[0] ? decodeURIComponent(pathSegments[0]) : '';
  const className = pathSegments ? pathSegments.slice(1).join('/') : '';
  const stringId = searchParams.get('stringId') ?? undefined;

  const [jars, setJars] = useState<JarItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [expandedJar, setExpandedJar] = useState<string | null>(null);
  const [jarFiles, setJarFiles] = useState<Record<string, string[]>>({});
  const [fileTree, setFileTree] = useState<Record<string, TreeNode[]>>({});
  const [jarLoading, setJarLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // 用 ref 避免 expandJar 的依赖循环
  const jarFilesRef = useRef(jarFiles);
  jarFilesRef.current = jarFiles;

  useEffect(() => {
    async function fetchJars() {
      try {
        const res = await fetch(`/api/files/tree?dataset=${dataset}`);
        const data = await res.json();
        if (data.tree) setJars(data.tree);
      } catch (err) {
        console.error('获取文件树失败:', err);
      } finally {
        setTreeLoading(false);
      }
    }
    fetchJars();
  }, [dataset]);

  useEffect(() => {
    async function fetchManifest() {
      try {
        const res = await fetch('/api/manifest');
        if (res.ok) setManifest(await res.json());
      } catch {
        // ignore
      }
    }
    fetchManifest();
  }, []);

  async function expandJar(jar: string) {
    setExpandedJar(jar);
    if (jarFilesRef.current[jar]) return; // 已缓存

    setJarLoading(true);
    try {
      const res = await fetch(
        `/api/files/tree?dataset=${dataset}&jar=${encodeURIComponent(jar)}`
      );
      const data = await res.json();
      if (data.files) {
        const files = data.files as string[];
        setJarFiles(prev => ({ ...prev, [jar]: files }));
        setFileTree(prev => ({ ...prev, [jar]: buildFileTree(files) }));
      }
    } catch (err) {
      console.error('获取 jar 内容失败:', err);
    } finally {
      setJarLoading(false);
    }
  }

  function toggleJar(jar: string) {
    if (expandedJar === jar) {
      setExpandedJar(null);
    } else {
      expandJar(jar);
    }
  }

  function toggleDir(dirPath: string) {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }

  // 当 jarName 变化时自动展开对应 jar
  useEffect(() => {
    if (jarName && expandedJar !== jarName) {
      expandJar(jarName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jarName]);

  // jar 文件加载完成后，自动展开 className 所在的包路径
  useEffect(() => {
    if (!className || !jarName || !jarFiles[jarName]) return;
    const parts = className.split('/');
    const dirs: string[] = [];
    let cur = '';
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur ? `${cur}/${parts[i]}` : parts[i];
      dirs.push(cur);
    }
    setExpandedDirs(prev => {
      const next = new Set(prev);
      dirs.forEach(d => next.add(d));
      return next;
    });
  }, [className, jarName, jarFiles]);

  function buildSwitchUrl(targetDataset: string): string {
    if (!jarName) return `/viewer/${targetDataset}`;
    const pathPart = className
      ? `${encodeURIComponent(jarName)}/${className}`
      : encodeURIComponent(jarName);
    const qs = stringId ? `?stringId=${encodeURIComponent(stringId)}` : '';
    return `/viewer/${targetDataset}/${pathPart}${qs}`;
  }

  return (
    <aside className="sidebar">
      {/* 数据集切换器 */}
      <div className="sidebar-dataset-switcher">
        <Link
          href={buildSwitchUrl('original')}
          className={`dataset-tab ${dataset === 'original' ? 'active' : ''}`}
        >
          原文
        </Link>
        <Link
          href={buildSwitchUrl('localization')}
          className={`dataset-tab ${dataset === 'localization' ? 'active' : ''}`}
        >
          译文
        </Link>
      </div>

      {/* 文件树 */}
      <div className="sidebar-title">文件树</div>
      <div className="sidebar-tree">
        {treeLoading ? (
          <div className="sidebar-hint">正在扫描产物...</div>
        ) : jars.length === 0 ? (
          <div className="sidebar-hint">暂无产物数据</div>
        ) : (
          jars.map(jar => {
            const isExpanded = expandedJar === jar.path;
            const isActive = jarName === jar.path;
            const tree = fileTree[jar.path] ?? [];

            return (
              <div key={jar.path}>
                <div
                  className={`tree-node tree-node-jar ${isActive ? 'active' : ''}`}
                  onClick={() => toggleJar(jar.path)}
                  title={jar.name}
                >
                  <span className="tree-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                  <span className="icon">📦</span>
                  <span className="tree-node-name">{jar.name}</span>
                </div>

                {isExpanded && (
                  <div className="tree-jar-children">
                    {jarLoading && tree.length === 0 ? (
                      <div className="sidebar-hint">加载中...</div>
                    ) : (
                      tree.map(node => (
                        <TreeItem
                          key={node.path}
                          node={node}
                          dataset={dataset}
                          jarPath={jar.path}
                          activeClass={className}
                          expandedDirs={expandedDirs}
                          onToggleDir={toggleDir}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 版本信息 */}
      <div className="sidebar-version">
        <div className="sidebar-version-row">
          <span className="sidebar-version-label">Revision</span>
          <span className="sidebar-version-value mono">
            {manifest ? formatRevision(manifest.revision) : '…'}
          </span>
        </div>
        <div className="sidebar-version-row">
          <span className="sidebar-version-label">更新时间</span>
          <span className="sidebar-version-value">
            {manifest ? formatDate(manifest.lastUpdated) : '…'}
          </span>
        </div>
      </div>
    </aside>
  );
}
