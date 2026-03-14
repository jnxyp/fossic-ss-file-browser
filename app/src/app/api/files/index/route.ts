import { NextResponse } from 'next/server';
import { findLinesByUtf8ConstId } from '@/lib/resolver';

/**
 * GET /api/files/index?dataset=&jar=&class=&utf8ConstId=
 * 返回指定 class 中某个 utf8ConstId 对应的所有行号（支持多重匹配）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset') as 'original' | 'localization';
  const jar = searchParams.get('jar');
  const className = searchParams.get('class');
  const utf8ConstId = searchParams.get('utf8ConstId');

  if (!dataset || !jar || !className || !utf8ConstId) {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '缺少必要参数: dataset, jar, class, utf8ConstId' }, { status: 400 });
  }
  if (dataset !== 'original' && dataset !== 'localization') {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '无效的 dataset 值' }, { status: 400 });
  }

  const lines = await findLinesByUtf8ConstId(jar, className, utf8ConstId, dataset);
  if (lines.length === 0) {
    return NextResponse.json({ error: 'STRING_NOT_FOUND', lines: [] }, { status: 404 });
  }

  return NextResponse.json({ lines });
}
