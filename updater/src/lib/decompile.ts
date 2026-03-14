import { execSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import { logger } from './logger';

const CFR_JAR = process.env.CFR_JAR || '/app/tools/cfr.jar';

/**
 * 用修改版 CFR 反编译 jar 文件，直接输出为 zip（含 per-class .strings.json）
 * @param jarPath  输入 JAR 路径
 * @param outputZip 输出 zip 路径（CFR --outputzip 参数）
 */
export function decompile(jarPath: string, outputZip: string): void {
  fs.mkdirSync(path.dirname(outputZip), { recursive: true });
  const cmd = [
    'java', '-jar', `"${CFR_JAR}"`,
    `"${jarPath}"`,
    '--outputzip', `"${outputZip}"`,
    '--outputstringindex', 'true',
  ].join(' ');
  logger.info('反编译:', path.basename(jarPath), '→', path.basename(outputZip));
  try {
    execSync(cmd, {
      stdio: 'pipe',
      timeout: 10 * 60 * 1000, // 10 分钟超时
    });
  } catch (err: unknown) {
    // CFR 可能在遇到不支持的字节码时以非零退出，但仍会产出大部分文件
    const msg = err instanceof Error ? err.message.substring(0, 300) : String(err);
    logger.warn('CFR 退出码非零（部分错误可忽略）:', msg);
  }
}
