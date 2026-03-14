import { NextResponse } from 'next/server';
import { getManifest } from '@/lib/manifest';

/**
 * 内部更新通知接口
 * 当 updater 完成一次 A/B 切换并更新 manifest.json 后，会调用此接口通知 app
 */
export async function POST() {
  // 由于 Next.js App Router 默认对文件读取有一定的缓存或静态处理，
  // 此接口在未来可以用来清理内存缓存。
  // 目前我们只需重新读取并确认当前的 manifest 状态。
  const manifest = getManifest();
  
  console.log(`收到更新通知。当前数据集: ${manifest.current}, 版本: ${manifest.revision}`);
  
  return NextResponse.json({
    success: true,
    message: '更新通知已收到',
    manifest
  });
}
