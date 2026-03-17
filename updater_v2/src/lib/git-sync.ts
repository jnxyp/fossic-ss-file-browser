import { execSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import { logger } from './logger';

const REPO_URL    = process.env.REPO_URL     || 'https://github.com/TruthOriginem/Starsector-Localization-CN.git';
const WORK_DIR    = process.env.WORK_DIR     || '/tmp/ss-repo';
const SPARSE_DIRS = ['original', 'localization', 'para_tranz'];

function git(args: string): string {
  const cmd = `git ${args}`;
  logger.info('执行:', cmd);
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

export function sync(): void {
  if (fs.existsSync(path.join(WORK_DIR, '.git'))) {
    logger.info('Git 仓库已存在，执行 fetch...');
    git(`-C ${WORK_DIR} sparse-checkout set ${SPARSE_DIRS.join(' ')}`);
    git(`-C ${WORK_DIR} fetch --depth=1 origin ${process.env.GITHUB_BRANCH || 'master'}`);
    git(`-C ${WORK_DIR} checkout FETCH_HEAD`);
  } else {
    logger.info('首次克隆仓库（sparse checkout）...');
    fs.mkdirSync(WORK_DIR, { recursive: true });
    git(`clone --filter=blob:none --no-checkout --depth=1 ${REPO_URL} ${WORK_DIR}`);
    git(`-C ${WORK_DIR} sparse-checkout init --cone`);
    git(`-C ${WORK_DIR} sparse-checkout set ${SPARSE_DIRS.join(' ')}`);
    git(`-C ${WORK_DIR} checkout ${process.env.GITHUB_BRANCH || 'master'}`);
  }
}

export interface JarEntry {
  name: string;
  path: string;
}

export function getJarPaths(type: 'original' | 'localization'): JarEntry[] {
  const dir = path.join(WORK_DIR, type);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jar'))
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

export function getParatranzMapPath(): string {
  return path.join(WORK_DIR, 'para_tranz', 'para_tranz_map.json');
}
