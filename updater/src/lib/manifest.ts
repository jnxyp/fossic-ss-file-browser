import fs   from 'fs';
import path from 'path';

export interface Manifest {
  current:     'A' | 'B';
  revision:    string;
  lastUpdated: string;
}

export const DATA_ROOT     = process.env.DATA_ROOT     || '/app/artifacts';
const        MANIFEST_PATH = path.join(DATA_ROOT, 'manifest.json');

export function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { current: 'A', revision: 'initial', lastUpdated: '' };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
}

export function writeManifest(manifest: Manifest): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function getInactiveSlot(): 'A' | 'B' {
  return readManifest().current === 'A' ? 'B' : 'A';
}

/** 翻转活跃槽，写入新 revision，返回新的 manifest */
export function flipSlot(newRevision: string): Manifest {
  const m   = readManifest();
  m.current = m.current === 'A' ? 'B' : 'A';
  m.revision    = newRevision;
  m.lastUpdated = new Date().toISOString();
  writeManifest(m);
  return m;
}
