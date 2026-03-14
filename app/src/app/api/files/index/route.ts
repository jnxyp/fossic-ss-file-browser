import { NextResponse } from 'next/server';
import { findLinesByStringId } from '@/lib/resolver';

/**
 * GET /api/files/index?dataset=&jar=&class=&stringId=
 * 返回指定 class 中某个 stringId 对应的所有行号（支持多重匹配）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset') as 'original' | 'localization';
  const jar = searchParams.get('jar');
  const className = searchParams.get('class');
  const stringId = searchParams.get('stringId');

  if (!dataset || !jar || !className || !stringId) {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '缺少必要参数: dataset, jar, class, stringId' }, { status: 400 });
  }
  if (dataset !== 'original' && dataset !== 'localization') {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '无效的 dataset 值' }, { status: 400 });
  }

  const lines = await findLinesByStringId(jar, className, stringId, dataset);
  if (lines.length === 0) {
    return NextResponse.json({ error: 'STRING_NOT_FOUND', lines: [] }, { status: 404 });
  }

  return NextResponse.json({ lines });
}
