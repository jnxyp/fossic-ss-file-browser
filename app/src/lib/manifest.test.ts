import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { getManifest, getArtifactsPath } from './manifest';

// 正确模拟 fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('Manifest Utility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DATA_ROOT = '/tmp/artifacts';
  });

  it('成功读取并解析 manifest.json', () => {
    const mockManifest = { current: 'B', revision: 'test-sha', lastUpdated: '2026-03-13' };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

    const manifest = getManifest();
    expect(manifest.current).toBe('B');
    expect(manifest.revision).toBe('test-sha');
  });

  it('文件不存在时应安全降级到默认 A 目录', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const manifest = getManifest();
    expect(manifest.current).toBe('A');
    expect(manifest.revision).toBe('initial');
  });

  it('获取正确的 A/B 数据集路径', () => {
    const mockManifest = { current: 'B', revision: 'sha', lastUpdated: '' };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockManifest));

    const pathStr = getArtifactsPath();
    expect(pathStr.endsWith('B')).toBe(true);
  });
});
