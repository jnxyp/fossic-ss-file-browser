import { highlightCode } from '@/lib/shiki';

interface CodeViewerProps {
  code: string;
  lang?: string;
}

/**
 * 代码查看器组件 (Server Component)
 */
export default async function CodeViewer({ code, lang = 'java' }: CodeViewerProps) {
  // 在服务器端执行高亮
  const html = await highlightCode(code, lang);

  return (
    <div 
      className="code-viewer"
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  );
}
