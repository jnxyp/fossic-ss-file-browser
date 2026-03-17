import path from 'path';
import { logger } from './logger';
import { getLatestCommitSha } from './github';
import { sync, getJarPaths, getParatranzMapPath } from './git-sync';
import { decompile } from './decompile';
import { openDb, initSchema, clearData, SCHEMA_VERSION, type Database } from './db';
import { importZipToDb } from './importer';
import { loadParatranzJarTargets, importParatranzJarTargets, applyParatranzMatches } from './paratranz';
import { notifyApp } from './notify';

const DATA_ROOT = process.env.DATA_ROOT || '/app/data';
const DB_PATH   = path.join(DATA_ROOT, 'ssfb.sqlite');

const TYPES = ['original', 'localization'] as const;

function getDecompiledZipPath(type: typeof TYPES[number], jarName: string): string {
  return path.join(DATA_ROOT, 'decompiled', type, jarName.replace(/\.jar$/, '.zip'));
}

function readRevision(db: Database.Database): string {
  const row = db.prepare<[], { value: string }>(
    "SELECT value FROM meta WHERE key = 'revision'"
  ).get();
  return row?.value ?? '';
}

export async function run(force = false): Promise<void> {
  logger.info('=== 开始检查更新 ===');

  try {
    // ------------------------------------------------------------------
    // 1. 检查远端 SHA
    // ------------------------------------------------------------------
    const latestSha = await getLatestCommitSha();
    const db        = openDb(DB_PATH);
    initSchema(db);

    const currentRevision = readRevision(db);
    logger.info(`远端 SHA: ${latestSha.substring(0, 8)}, 当前 SHA: ${(currentRevision || 'none').substring(0, 8)}`);

    if (!force && latestSha === currentRevision) {
      logger.info('已是最新版本，跳过更新');
      db.close();
      return;
    }

    if (force && latestSha === currentRevision) {
      logger.info('启动强制刷新：即使 SHA 未变化也重新导入');
    } else {
      logger.info('检测到新版本，开始同步...');
    }

    // ------------------------------------------------------------------
    // 2. Git 同步
    // ------------------------------------------------------------------
    sync();
    const paratranzTargets = loadParatranzJarTargets(getParatranzMapPath());

    // ------------------------------------------------------------------
    // 3. 反编译阶段（不动 DB，失败直接 throw）
    // ------------------------------------------------------------------
    logger.info('--- 开始反编译 ---');

    const jarMap: Record<typeof TYPES[number], Array<{ name: string; zipPath: string }>> = {
      original:     [],
      localization: [],
    };

    for (const type of TYPES) {
      const jars = getJarPaths(type);
      logger.info(`[${type}] 找到 ${jars.length} 个 JAR`);

      for (const jar of jars) {
        const zipPath = getDecompiledZipPath(type, jar.name);
        decompile(jar.path, zipPath);
        jarMap[type].push({ name: jar.name, zipPath });
      }
    }

    // ------------------------------------------------------------------
    // 4. 导入阶段（单个大事务，失败自动回滚，旧库保持不变）
    // ------------------------------------------------------------------
    logger.info('--- 开始导入到 SQLite ---');

    const importAll = db.transaction(() => {
      clearData(db);
      importParatranzJarTargets(db, paratranzTargets);

      for (const type of TYPES) {
        for (const { name, zipPath } of jarMap[type]) {
          logger.info(`导入: [${type}] ${name}`);
          importZipToDb(db, zipPath, name, type);
        }
      }

      applyParatranzMatches(db);

      db.prepare(`
        INSERT OR REPLACE INTO meta (key, value) VALUES
          ('revision',       ?),
          ('last_updated',   ?),
          ('schema_version', ?)
      `).run(latestSha, new Date().toISOString(), SCHEMA_VERSION);
    });

    importAll();

    logger.info(`导入完成，revision → ${latestSha.substring(0, 8)}`);

    db.close();

    // ------------------------------------------------------------------
    // 5. 通知 app
    // ------------------------------------------------------------------
    await notifyApp();

    logger.info('=== 更新完成 ===');
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    logger.error('更新流程出错:', msg);
  }
}
