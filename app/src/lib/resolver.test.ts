import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findLineByStringId } from './resolver';
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

// 模拟 manifestlib
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
    
    // 模拟文件存在且返回内容
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const line = await findLineByStringId('test.jar', 'com/fs/api/Sample.java', '#11');
    expect(line).toBe(100);
  });

  it('当 className 或 utf8_index 不匹配时应返回 null', async () => {
    const mockIndexData = { 'OtherClass': [] };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const line = await findLineByStringId('test.jar', 'com/fs/api/Sample.java', '#10');
    expect(line).toBeNull();
  });

  it('当索引文件不存在时应返回 null', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const line = await findLineByStringId('missing.jar', 'AnyClass', '#1');
    expect(line).toBeNull();
  });
});
