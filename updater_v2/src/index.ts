import http from 'http';
import { logger } from './lib/logger';
import { run } from './lib/pipeline';

const WEBHOOK_PORT  = parseInt(process.env.WEBHOOK_PORT  || '3001', 10);
const WATCH_BRANCH  = process.env.GITHUB_BRANCH           || 'master';

logger.info('Updater v2 服务启动（webhook 模式）');
logger.info(`监听端口: ${WEBHOOK_PORT}，监控分支: ${WATCH_BRANCH}`);

// 启动时强制执行一次，确保数据库已就绪。
void run(true);

// ── Webhook 服务 ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      logger.warn('Webhook: 无法解析请求体');
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const ref   = typeof payload.ref   === 'string' ? payload.ref   : undefined;
    const after = typeof payload.after === 'string' ? payload.after : undefined;

    // 过滤非目标分支的推送。
    if (ref !== undefined && ref !== `refs/heads/${WATCH_BRANCH}`) {
      logger.info(`Webhook: 忽略推送到 ${ref}`);
      res.writeHead(200);
      res.end('ignored');
      return;
    }

    // 立即响应，异步执行流水线。
    res.writeHead(202);
    res.end('accepted');

    if (after) {
      logger.info(`Webhook: 收到推送，SHA=${after.substring(0, 8)}`);
    } else {
      logger.info('Webhook: 收到推送（无 SHA 信息）');
    }

    void run(false, after);
  });
});

server.listen(WEBHOOK_PORT, () => {
  logger.info(`Webhook 服务器已就绪，监听 :${WEBHOOK_PORT}`);
});
