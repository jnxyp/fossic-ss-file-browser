import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findLinesByUtf8ConstId } from './resolver';
import fs from 'fs';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('./manifest', () => ({
  getArtifactsPath: () => '/tmp/artifacts/A',
}));

describe('Resolver Utility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('应根据 utf8ConstId 在父类常量表中找到行号', async () => {
    const mockIndexData = {
      'com/fs/api/Sample': [
        { utf8_index: 10, const_table: '', line: 42 },
        { utf8_index: 11, const_table: '', line: 100 },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByUtf8ConstId('test.jar', 'com/fs/api/Sample.java', '#11');
    expect(lines).toEqual([100]);
  });

  it('应根据内部类常量表筛出对应行号', async () => {
    const mockIndexData = {
      'com/fs/api/Sample': [
        { utf8_index: 10, const_table: '', line: 42 },
        { utf8_index: 10, const_table: '$1', line: 87 },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByUtf8ConstId('test.jar', 'com/fs/api/Sample$1.java', '#10');
    expect(lines).toEqual([87]);
  });

  it('当 className 或 utf8ConstId 不匹配时应返回空数组', async () => {
    const mockIndexData = {
      'OtherClass': [],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndexData));

    const lines = await findLinesByUtf8ConstId('test.jar', 'com/fs/api/Sample.java', '#10');
    expect(lines).toEqual([]);
  });

  it('当索引文件不存在时应返回空数组', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const lines = await findLinesByUtf8ConstId('missing.jar', 'AnyClass', '#1');
    expect(lines).toEqual([]);
  });
});
