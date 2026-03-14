import { getHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;

/**
 * 初始化并获取 Shiki 高亮器单例 (Server Side Only)
 */
export async function getShikiHighlighter() {
  if (highlighter) return highlighter;
  
  highlighter = await getHighlighter({
    themes: ['github-dark'],
    langs: ['java', 'csv', 'json', 'txt'],
  });
  
  return highlighter;
}

/**
 * 将代码片段转换为带高亮的 HTML
 * @param code 源代码
 * @param lang 语言标识
 */
export async function highlightCode(code: string, lang: string = 'java') {
  const shiki = await getShikiHighlighter();
  
  return shiki.codeToHtml(code, {
    lang,
    theme: 'github-dark',
  });
}
