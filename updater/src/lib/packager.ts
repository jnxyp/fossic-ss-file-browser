import AdmZip from 'adm-zip';
import fs   from 'fs';
import path from 'path';
import { logger } from './logger';

interface StringEntry {
  cp_index:   number;
  utf8_index: number;
  value:      string;
  line:       number;
}

interface PerClassIndex {
  class:   string;
  strings: StringEntry[];
}

type AggregateIndex = Record<string, StringEntry[]>;

/**
 * 从 CFR 输出的 zip 中提取 per-class .strings.json，
 * 聚合为 jar 级别的 {baseName}.strings.json 写入目标目录。
 * zip 文件本身已由 CFR 直接生成，无需再次打包。
 *
 * @param zipPath   CFR 输出的 zip 路径
 * @param outputDir 目标目录（artifacts/{slot}/{type}/）
 * @param jarName   原始 jar 文件名（如 starfarer.api.jar）
 */
export function buildIndex(zipPath: string, outputDir: string, jarName: string): void {
  const baseName  = jarName.replace(/\.jar$/, '');
  const indexPath = path.join(outputDir, `${baseName}.strings.json`);

  const aggregate = readAggregateIndex(zipPath);
  fs.writeFileSync(indexPath, JSON.stringify(aggregate, null, 2), 'utf-8');

  logger.info(`索引生成完成: ${baseName}.strings.json (${Object.keys(aggregate).length} 类)`);
}

function readAggregateIndex(zipPath: string): AggregateIndex {
  const zip       = new AdmZip(zipPath);
  const aggregate: AggregateIndex = {};

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.strings.json')) continue;
    try {
      const content = JSON.parse(entry.getData().toString('utf-8')) as PerClassIndex;
      if (content.class && Array.isArray(content.strings)) {
        aggregate[content.class] = content.strings;
      }
    } catch {
      // 跳过解析失败的条目
    }
  }

  return aggregate;
}
