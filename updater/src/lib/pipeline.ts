import path from 'path';
import { logger }          from './logger';
import { readManifest, getInactiveSlot, flipSlot, DATA_ROOT } from './manifest';
import { getLatestCommitSha }  from './github';
import { sync, getJarPaths }   from './git-sync';
import { decompile }           from './decompile';
import { buildIndex }          from './packager';
import { notifyApp }           from './notify';

const TYPES = ['original', 'localization'] as const;

export async function run(): Promise<void> {
  logger.info('=== 开始检查更新 ===');

  try {
    // 1. 获取远端最新 SHA
    const latestSha = await getLatestCommitSha();
    const manifest  = readManifest();
    logger.info(`远端 SHA: ${latestSha.substring(0, 8)}, 当前 SHA: ${manifest.revision.substring(0, 8)}`);

    if (latestSha === manifest.revision) {
      logger.info('已是最新版本，跳过更新');
      return;
    }

    // 2. 同步 Git 仓库（sparse checkout: original/ + localization/）
    logger.info('检测到新版本，开始同步...');
    sync();

    // 3. 确定非活跃槽
    const inactiveSlot = getInactiveSlot();
    logger.info(`写入非活跃槽: ${inactiveSlot}`);

    // 4. 逐类型处理 JAR
    for (const type of TYPES) {
      const jars = getJarPaths(type);
      logger.info(`[${type}] 找到 ${jars.length} 个 JAR`);

      for (const jar of jars) {
        const outputDir = path.join(DATA_ROOT, inactiveSlot, type);
        const baseName  = jar.name.replace(/\.jar$/, '');
        const outputZip = path.join(outputDir, `${baseName}.zip`);

        // 4a. 反编译（CFR 直接输出 zip）
        decompile(jar.path, outputZip);

        // 4b. 从 zip 内的 per-class .strings.json 生成聚合索引
        buildIndex(outputZip, outputDir, jar.name);
      }
    }

    // 5. 翻转 manifest 指向新槽
    const newManifest = flipSlot(latestSha);
    logger.info(`Manifest 已切换: ${manifest.current} → ${newManifest.current}`);

    // 6. 通知 app
    await notifyApp();

    logger.info('=== 更新完成 ===');
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    logger.error('更新流程出错:', msg);
  }
}
