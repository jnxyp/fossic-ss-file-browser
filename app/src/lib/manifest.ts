import fs from 'fs';
import path from 'path';

/**
 * Manifest 文件结构定义
 */
export interface Manifest {
  current: 'A' | 'B'; // 当前正在使用的目录 (A 或 B)
  revision: string;    // 当前数据集的 Git Commit SHA
  lastUpdated: string; // 最后更新时间戳
}

// 基础数据目录，默认为容器内的 /app/artifacts
const DATA_ROOT = process.env.DATA_ROOT || '/app/artifacts';
const MANIFEST_PATH = path.join(DATA_ROOT, 'manifest.json');

/**
 * 从文件系统读取当前的 manifest.json
 */
export function getManifest(): Manifest {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      console.warn('Manifest 文件不存在，使用默认配置');
      return { current: 'A', revision: 'initial', lastUpdated: '' };
    }
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('读取 Manifest 失败:', error);
    // 兜底返回 A 目录
    return { current: 'A', revision: 'initial', lastUpdated: '' };
  }
}

/**
 * 获取当前激活的数据集绝对路径 (DATA_ROOT + A/B)
 */
export function getArtifactsPath(): string {
  const manifest = getManifest();
  return path.join(DATA_ROOT, manifest.current);
}
