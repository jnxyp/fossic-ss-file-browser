import { NextResponse } from 'next/server';
import { readFileFromJar } from '@/lib/resolver';

/**
 * GET /api/files/content?dataset=&jar=&class=
 * 返回指定类文件的原始代码字符串
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset') as 'original' | 'localization';
  const jar = searchParams.get('jar');
  const className = searchParams.get('class');

  if (!dataset || !jar || !className) {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '缺少必要参数: dataset, jar, class' }, { status: 400 });
  }
  if (dataset !== 'original' && dataset !== 'localization') {
    return NextResponse.json({ error: 'BAD_PAYLOAD', message: '无效的 dataset 值' }, { status: 400 });
  }

  const content = await readFileFromJar(jar, className, dataset);
  if (content === null) {
    return NextResponse.json({ error: 'CLASS_NOT_FOUND', message: `在 ${jar} 中找不到 ${className}` }, { status: 404 });
  }

  return NextResponse.json({ content });
}
