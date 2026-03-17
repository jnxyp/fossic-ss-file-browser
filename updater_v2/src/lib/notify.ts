import { logger } from './logger';

const APP_URL = process.env.APP_INTERNAL_URL || 'http://app:3000';

export async function notifyApp(): Promise<void> {
  const url = `${APP_URL}/api/internal/update-notify`;
  logger.info('通知 app 更新完成:', url);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'updater' }),
    });
    if (resp.ok) {
      logger.info('app 已确认更新通知');
    } else {
      logger.warn('app 通知响应异常:', resp.status);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('通知 app 失败（可能尚未启动）:', msg);
  }
}
