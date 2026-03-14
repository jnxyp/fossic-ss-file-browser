import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findLinesByStringId } from './resolver';
import fs from 'fs';

// 模拟 fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// 模拟 manifest
vi.mock('./manifest', () => ({
  getArtifactsPath: () => '/tmp/artifacts/A'
}));

describe('Resolver Utility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('应根据 utf8_index 在索引文件中找到行号', async () => {
    const mockIndexData = {
      'com/fs/api/Sample': [
        { utf8_index: 10, line: 42 },
        { utf8_index: 11, line: 100 }
      ]
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByStringId('test.jar', 'com/fs/api/Sample.java', '#11');
    expect(lines).toEqual([100]);
  });

  it('应返回同一 utf8_index 的所有匹配行（多重匹配）', async () => {
    const mockIndexData = {
      'com/fs/api/Sample': [
        { utf8_index: 10, line: 42 },
        { utf8_index: 10, line: 87 },
      ]
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByStringId('test.jar', 'com/fs/api/Sample.java', '#10');
    expect(lines).toEqual([42, 87]);
  });

  it('当 className 或 utf8_index 不匹配时应返回空数组', async () => {
    const mockIndexData = { 'OtherClass': [] };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByStringId('test.jar', 'com/fs/api/Sample.java', '#10');
    expect(lines).toEqual([]);
  });

  it('当索引文件不存在时应返回空数组', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const lines = await findLinesByStringId('missing.jar', 'AnyClass', '#1');
    expect(lines).toEqual([]);
  });
});
