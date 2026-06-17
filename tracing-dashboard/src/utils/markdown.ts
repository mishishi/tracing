export function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = md;

  // Escape HTML entities first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (fenced) — before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    return '<pre class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-auto text-[11px] my-2"><code>' + code + '</code></pre>';
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] text-pink-500">$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-gray-800 dark:text-gray-200 mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-gray-800 dark:text-gray-200 mt-4 mb-2">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-500 hover:text-indigo-600 underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="border-gray-200 dark:border-gray-700 my-3" />');

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '<li class="ml-4 text-[11px] text-gray-600 dark:text-gray-400">$2</li>');

  // Tables — basic support
  html = html.replace(/^\|(.+)\|$/gm, (_match: string, cells: string) => {
    const cellArr = cells.split('|').map(c => c.trim());
    const isHeader = cellArr.every(c => /^[-:]+$/.test(c));
    if (isHeader) return '';
    const tag = 'td';
    return '<tr>' + cellArr.map(c => '<' + tag + ' class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px]">' + c + '</' + tag + '>').join('') + '</tr>';
  });

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="list-disc my-1">$&</ul>');

  // Wrap consecutive <tr> in <table>
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/g, '<table class="border-collapse border border-gray-200 dark:border-gray-700 my-2 w-full">$&</table>');

  // Paragraphs: wrap lines that aren't already wrapped
  html = html.replace(/^(?!<[a-z])(.+)$/gm, '<p class="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed my-1">$1</p>');

  return html;
}
