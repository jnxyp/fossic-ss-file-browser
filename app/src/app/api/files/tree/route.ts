import { NextResponse } from 'next/server';
import { getArtifactsPath } from '@/lib/manifest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/**
 * 文件树节点接口
 */
export interface FileTreeNode {
  name: string;
  path: string;       // 逻辑路径 (e.g. "starfarer.api.jar/com/fs/...")
  type: 'file' | 'directory' | 'jar';
  children?: FileTreeNode[];
}

/**
 * 获取数据集的文件树结构
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = (searchParams.get('dataset') as 'original' | 'localization') || 'localization';
  
  const artifactsPath = getArtifactsPath();
  const rootDir = path.join(artifactsPath, dataset);
  
  if (!fs.existsSync(rootDir)) {
    return NextResponse.json({ tree: [], error: '数据集目录不存在' });
  }

  // 扫描第一层：所有的 .zip (源码包) 和 .strings.json (索引)
  // 我们只向用户展示 .zip/jar 包
  try {
    const items = fs.readdirSync(rootDir);
    const tree: FileTreeNode[] = items
      .filter(item => item.endsWith('.zip'))
      .map(zipName => {
        // 构建 Jar 节点
        const node: FileTreeNode = {
          name: zipName.replace('.zip', ''), // 展示为 jar 名
          path: zipName,
          type: 'jar',
          // 为了保持 API 响应快速，Zip 内部结构可以后续改为按需加载
          // 这里我们先列出 Zip 内的前两层作为测试
        };
        return node;
      });

    return NextResponse.json({ tree });
  } catch (error) {
    console.error('扫描文件树失败:', error);
    return NextResponse.json({ tree: [], error: '内部服务器错误' }, { status: 500 });
  }
}
