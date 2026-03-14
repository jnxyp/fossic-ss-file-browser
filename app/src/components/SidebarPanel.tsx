'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

interface DirNode {
  kind: 'dir';
  name: string;
  path: string;
  children: TreeNode[];
}

interface FileNode {
  kind: 'file';
  name: string;
  path: string;
}

type TreeNode = DirNode | FileNode;

interface JarItem {
  name: string;
  path: string;
}

function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;
    let currentPath = '';

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const isFile = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (isFile) {
        current.push({ kind: 'file', name, path: filePath });
        continue;
      }

      let dir = current.find(
        (node): node is DirNode => node.kind === 'dir' && node.name === name
      );

      if (!dir) {
        dir = { kind: 'dir', name, path: currentPath, children: [] };
        current.push(dir);
      }

      current = dir.children;
    }
  }

  return root;
}

function getExpandedDirSet(className: string) {
  const parts = className.split('/');
  const dirs: string[] = [];
  let current = '';

  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];
    dirs.push(current);
  }

  return new Set(dirs);
}

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
        <span className="icon" aria-hidden="true">📄</span>
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
        title={node.path}
      >
        <span className="tree-expand-icon" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="tree-node-name">{node.name}</span>
      </div>
      {isExpanded ? (
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
      ) : null}
    </div>
  );
}

export default function SidebarPanel({ dataset }: { dataset: string }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const pathSegments = params.path as string[] | undefined;
  const jarName = pathSegments?.[0] ? decodeURIComponent(pathSegments[0]) : '';
  const className = pathSegments
    ? pathSegments.slice(1).map(segment => decodeURIComponent(segment)).join('/')
    : '';
  const utf8ConstId = searchParams.get('utf8ConstId') ?? undefined;
  const subclass = searchParams.get('subclass') ?? undefined;
  const scrollTreeToCurrent = searchParams.get('scrollTreeToCurrent') === '1';

  const [jars, setJars] = useState<JarItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expandedJar, setExpandedJar] = useState<string | null>(null);
  const [jarFiles, setJarFiles] = useState<Record<string, string[]>>({});
  const [fileTree, setFileTree] = useState<Record<string, TreeNode[]>>({});
  const [jarLoading, setJarLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const sidebarTreeRef = useRef<HTMLDivElement>(null);
  const jarFilesRef = useRef(jarFiles);
  const routeKeyRef = useRef('');
  jarFilesRef.current = jarFiles;

  useEffect(() => {
    async function fetchJars() {
      try {
        const response = await fetch(`/api/files/tree?dataset=${dataset}`);
        const data = await response.json();
        if (data.tree) {
          setJars(data.tree);
        }
      } catch (error) {
        console.error('获取文件树失败:', error);
      } finally {
        setTreeLoading(false);
      }
    }

    void fetchJars();
  }, [dataset]);

  async function expandJar(jar: string) {
    setExpandedJar(jar);
    if (jarFilesRef.current[jar]) {
      return;
    }

    setJarLoading(true);
    try {
      const response = await fetch(
        `/api/files/tree?dataset=${dataset}&jar=${encodeURIComponent(jar)}`
      );
      const data = await response.json();
      if (data.files) {
        const files = data.files as string[];
        setJarFiles(prev => ({ ...prev, [jar]: files }));
        setFileTree(prev => ({ ...prev, [jar]: buildFileTree(files) }));
      }
    } catch (error) {
      console.error('获取 JAR 内容失败:', error);
    } finally {
      setJarLoading(false);
    }
  }

  function toggleJar(jar: string) {
    if (expandedJar === jar) {
      setExpandedJar(null);
      return;
    }

    void expandJar(jar);
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

  useEffect(() => {
    const routeKey = `${jarName}:${className}`;
    if (!jarName) {
      routeKeyRef.current = '';
      setExpandedJar(null);
      setExpandedDirs(new Set());
      return;
    }

    if (routeKeyRef.current === routeKey) {
      return;
    }

    routeKeyRef.current = routeKey;
    setExpandedJar(jarName);
    setExpandedDirs(className ? getExpandedDirSet(className) : new Set());

    if (!jarFilesRef.current[jarName]) {
      void expandJar(jarName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, jarName]);

  useEffect(() => {
    if (!scrollTreeToCurrent || !className || !jarName || !jarFiles[jarName] || !sidebarTreeRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const activeNode = sidebarTreeRef.current?.querySelector('.tree-node-file.active');
      if (activeNode instanceof HTMLElement) {
        activeNode.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [className, expandedDirs, expandedJar, jarFiles, jarName, scrollTreeToCurrent]);

  function buildSwitchUrl(targetDataset: string) {
    if (!jarName) {
      return `/viewer/${targetDataset}`;
    }

    const pathPart = className
      ? `${encodeURIComponent(jarName)}/${className}`
      : encodeURIComponent(jarName);
    const query = new URLSearchParams();
    if (utf8ConstId) {
      query.set('utf8ConstId', utf8ConstId);
    }
    if (subclass) {
      query.set('subclass', subclass);
    }
    query.set('scrollTreeToCurrent', '1');

    return `/viewer/${targetDataset}/${pathPart}${query.size > 0 ? `?${query.toString()}` : ''}`;
  }

  return (
    <aside className="sidebar">
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

      <div className="sidebar-title">文件树</div>
      <div ref={sidebarTreeRef} className="sidebar-tree">
        {treeLoading ? (
          <div className="sidebar-hint">正在扫描产物...</div>
        ) : jars.length === 0 ? (
          <div className="sidebar-hint">暂无可浏览的数据</div>
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
                  title={jar.path}
                >
                  <span className="tree-expand-icon" aria-hidden="true">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="icon" aria-hidden="true">📦</span>
                  <span className="tree-node-name">{jar.name}</span>
                </div>

                {isExpanded ? (
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
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
