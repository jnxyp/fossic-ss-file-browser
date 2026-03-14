'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 文件树节点接口
 */
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'jar';
}

/**
 * 侧边栏文件树组件
 */
export default function Sidebar({ dataset }: { dataset: string }) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    async function fetchTree() {
      try {
        // 请求文件树 API
        const res = await fetch(`/api/files/tree?dataset=${dataset}`);
        const data = await res.json();
        if (data.tree) {
          setTree(data.tree);
        }
      } catch (err) {
        console.error('获取文件树失败:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTree();
  }, [dataset]);

  return (
    <aside className="sidebar">
      <div style={{ 
        padding: '1.2rem 1.5rem', 
        borderBottom: '1px solid var(--border-color)', 
        fontWeight: 600,
        fontSize: '14px',
        color: 'var(--text-color)'
      }}>
        文件树
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {loading ? (
          <div style={{ padding: '1rem 1.5rem', fontSize: '12px', opacity: 0.5 }}>
            正在扫描产物...
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: '1rem 1.5rem', fontSize: '12px', opacity: 0.5 }}>
            暂无产物数据
          </div>
        ) : (
          tree.map((node) => {
            // 基础跳转路径：/viewer/[dataset]/[jarName]
            const href = `/viewer/${dataset}/${encodeURIComponent(node.path)}`;
            // 简单的激活判断
            const isActive = pathname.includes(node.path);

            return (
              <Link 
                key={node.path} 
                href={href}
                className={`tree-node ${isActive ? 'active' : ''}`}
                title={node.name}
              >
                <span className="icon">
                  {node.type === 'jar' ? '📦' : '📄'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {node.name}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
