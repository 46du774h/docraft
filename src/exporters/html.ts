import MarkdownIt from 'markdown-it';
import { extractHeadings } from '../core/headings';
import { themeFor } from '../core/settings';
import type { Settings } from '../core/settings';
import type { ParsedDocument } from '../core/types';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!);
}

export function buildHtml(doc: ParsedDocument, settings: Settings): string {
  const headings = extractHeadings(doc.blocks);
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
  let headingIndex = 0;
  const renderHeadingOpen = markdown.renderer.rules.heading_open;
  markdown.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
    const heading = headings[headingIndex++];
    if (heading) tokens[index].attrSet('id', heading.id);
    return renderHeadingOpen
      ? renderHeadingOpen(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  const theme = themeFor(settings);
  const title = settings.title.trim() || doc.title || 'Document';
  const toc = settings.includeTableOfContents && headings.length
    ? `<nav class="table-of-contents" aria-label="Table of contents"><h2>Table of Contents</h2><ol>${headings
      .map((heading) => `<li class="toc-level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`)
      .join('')}</ol></nav>`
    : '';
  const body = markdown.render(doc.normalized);
  const documentBody = toc ? `<div class="document-content">${body}</div>` : body;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;padding:2rem;font-family:${escapeHtml(settings.fontFamily)},sans-serif;font-size:${settings.fontSize}pt;line-height:${theme.lineHeight};color:#${theme.bodyColor};background:#${theme.pageFill}}
main{max-width:900px;margin:0 auto}
h1,h2,h3,h4,h5,h6{color:#${theme.headingColor};line-height:1.25}
a{color:#${theme.linkColor}}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #${theme.tableBorder};padding:.45rem .6rem;text-align:left}
th{background:#${theme.tableHeaderFill};color:#${theme.tableHeaderColor}}
blockquote{border-left:3px solid #${theme.quoteBar};margin-left:0;padding:.1rem 1rem;color:#${theme.quoteColor};background:#${theme.quoteFill}}
pre,code{font-family:monospace;background:#${theme.codeFill};color:#${theme.codeColor}}
pre{padding:.75rem;overflow:auto}hr{border:0;border-top:1px solid #${theme.tableBorder}}
.table-of-contents{border-bottom:1px solid #${theme.tableBorder};margin-bottom:2rem;padding-bottom:1rem}
.table-of-contents ol{padding-left:1.5rem}.toc-level-1{font-weight:600}.toc-level-2{margin-left:1rem}.toc-level-3,.toc-level-4,.toc-level-5,.toc-level-6{margin-left:2rem}
@media print{body{padding:0}main{max-width:none}${toc ? '.document-content{break-before:page;page-break-before:always}' : ''}}
</style>
</head>
<body><main>${toc}${documentBody}</main></body>
</html>
`;
}
