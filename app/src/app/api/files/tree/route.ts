import { NextResponse } from 'next/server';
import { getArtifactsPath } from '@/lib/manifest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'jar';
  children?: FileTreeNode[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = (searchParams.get('dataset') as 'original' | 'localization') || 'localization';
  const jar = searchParams.get('jar');

  const artifactsPath = getArtifactsPath();
  const rootDir = path.join(artifactsPath, dataset);

  if (!fs.existsSync(rootDir)) {
    return NextResponse.json({ tree: [], error: '数据集目录不存在' });
  }

  try {
    // 请求展开某个 jar 内的文件列表
    if (jar) {
      const zipPath = path.join(rootDir, jar);
      if (!fs.existsSync(zipPath)) {
        return NextResponse.json({ files: [], error: 'JAR 不存在' }, { status: 404 });
      }
      const zip = new AdmZip(zipPath);
      const files = zip.getEntries()
        .filter(e => !e.isDirectory && e.entryName.endsWith('.java'))
        .map(e => e.entryName)
        .sort();
      return NextResponse.json({ files });
    }

    // 顶层：列出所有 zip 包
    const items = fs.readdirSync(rootDir);
    const tree: FileTreeNode[] = items
      .filter(item => item.endsWith('.zip'))
      .map(zipName => ({
        name: zipName.replace('.zip', ''),
        path: zipName,
        type: 'jar' as const,
      }));

    return NextResponse.json({ tree });
  } catch (error) {
    console.error('扫描文件树失败:', error);
    return NextResponse.json({ tree: [], error: '内部服务器错误' }, { status: 500 });
  }
}
