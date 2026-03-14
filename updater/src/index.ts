import { logger } from './lib/logger';
import { run }    from './lib/pipeline';

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL || '600', 10) * 1000;

logger.info('Updater 服务启动');
logger.info(`同步间隔: ${SYNC_INTERVAL_MS / 1000}s`);

// 启动时立即运行一次
run();

// 定时运行
setInterval(run, SYNC_INTERVAL_MS);
