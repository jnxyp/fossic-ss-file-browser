import { logger } from './lib/logger';
import { run } from './lib/pipeline';

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL || '600', 10) * 1000;

logger.info('Updater 服务启动');
logger.info(`同步间隔: ${SYNC_INTERVAL_MS / 1000}s`);

// 首次启动时强制刷新一次，即使 revision 未变化也重新生成产物。
void run(true);

// 后续定时任务仍按 revision 正常判断是否需要更新。
setInterval(run, SYNC_INTERVAL_MS);
