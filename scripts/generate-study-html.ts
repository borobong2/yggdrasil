/** Render private Markdown sources as static mobile study editions. No content is checked into Git.
 * npx tsx scripts/generate-study-html.ts /absolute/source-directory
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseMarkdown, tableCells } from '../src/client/blocks.js';

const input = process.argv[2];
if (!input) throw new Error('Pass a directory containing the seven study Markdown sources.');
const directory = resolve(input);
const files = ['plan', 'llm-core', 'llm-qa', 'llm-mock', 'nlp-core', 'nlp-qa', 'nlp-practice'];
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inline(text: string): string {
  return escape(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="reference">$1</span>');
}
const css = `
:root{color-scheme:light;--paper:#fafbf7;--ink:#263b32;--muted:#56655c;--line:#d7dfd4;--accent:#32634b}
*{box-sizing:border-box}html{scroll-behavior:auto;scroll-padding-top:20px}body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.85 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;overflow-wrap:anywhere}main{max-width:74ch;margin:auto;padding:32px 24px 64px}h1{font-size:clamp(27px,5vw,38px);line-height:1.4;letter-spacing:-.025em;text-wrap:balance;margin:0 0 20px}h2{font-size:24px;line-height:1.5;letter-spacing:-.02em;margin:44px 0 14px;padding-top:18px;border-top:1px solid var(--line);text-wrap:balance}h3{font-size:20px;line-height:1.6;margin:28px 0 12px}p{margin:12px 0}a{color:var(--accent);text-underline-offset:4px}nav{margin:24px 0 36px;padding:18px;background:#edf2e8;border-radius:8px}nav a{display:block;padding:9px 0;font-size:16px;line-height:1.6}ul,ol{padding-left:24px}li{margin:8px 0}details{margin:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}summary{padding:16px 4px;min-height:52px;cursor:pointer;font-weight:650;color:var(--accent)}.answer{padding:0 4px 20px}blockquote,.callout{margin:20px 0;padding:16px 18px;background:#edf2e8;border-radius:6px}.concepts{margin:18px 0}.concepts dt{font-size:19px;font-weight:700;margin-top:24px}.concepts dd{margin:6px 0 20px}.table-scroll{max-width:100%;overflow-x:auto;margin:20px 0;overscroll-behavior-x:contain}table{border-collapse:collapse;font-size:15px;line-height:1.75;min-width:420px;width:100%;font-variant-numeric:tabular-nums}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{background:#edf2e8}code{font:0.9em/1.7 ui-monospace,monospace;background:#eaf0e5;padding:2px 5px;border-radius:3px;overflow-wrap:anywhere}pre{max-width:100%;overflow:auto;padding:16px;background:#eaf0e5;border-radius:6px}pre code{padding:0;white-space:pre;overflow-wrap:normal}.reference,.note{color:var(--muted);font-size:15px}.check{font-weight:600;color:var(--accent)}.intro{color:var(--muted);font-size:16px;margin:16px 0 28px}hr{border:0;border-top:1px solid var(--line);margin:32px 0}::selection{background:#cde1c8}a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}html{scrollbar-color:#91a58c var(--paper)}@media(max-width:480px){body{font-size:17px}main{padding:24px 18px 48px}h2{font-size:23px}nav{padding:14px}table{font-size:14px}}@media print{nav{display:none}main{padding:0}details .answer{display:block}}`;

function render(markdown: string, headings?: { id: string; label: string }[]): string {
  return parseMarkdown(markdown.replace(/<details>\s*<summary>/g, '<details>\n<summary>')).map(b => {
    if (b.type === 'h1') return `<h1>${inline(b.text)}</h1>`;
    if (b.type === 'h2' || b.type === 'h3') {
      const id = headings && b.type === 'h2' ? 'section-' + (headings.length + 1) : '';
      if (headings && b.type === 'h2') headings.push({ id, label: b.text });
      return `<${b.type}${id ? ` id="${id}"` : ''}>${inline(b.text)}</${b.type}>`;
    }
    if (b.type === 'table') {
      const table = tableCells(b.text); if (!table) return `<pre>${escape(b.text)}</pre>`;
      if (table.header.length === 2) return `<dl class="concepts">${table.rows.map(row => `<dt>${inline(row[0] ?? '')}</dt><dd>${inline(row[1] ?? '')}</dd>`).join('')}</dl>`;
      return `<div class="table-scroll"><table><thead><tr>${table.header.map(c => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (b.type === 'toggle') { const [label, ...answer] = b.text.split('\n'); return `<details><summary>${inline(label || '정답 확인')}</summary><div class="answer">${render(answer.join('\n'))}</div></details>`; }
    if (b.type === 'code') return `<pre><code>${escape(b.text)}</code></pre>`;
    if (b.type === 'divider') return '<hr>';
    if (b.type === 'callout' || b.type === 'quote') return `<blockquote>${inline(b.text).replaceAll('\n', '<br>')}</blockquote>`;
    if (b.type === 'todo') return `<p><span class="check">${b.checked ? '☑' : '□'}</span> ${inline(b.text)}</p>`;
    if (b.type === 'bullet' || b.type === 'numbered') return `<${b.type === 'bullet' ? 'ul' : 'ol'}><li>${inline(b.text).replaceAll('\n', '<br>')}</li></${b.type === 'bullet' ? 'ul' : 'ol'}>`;
    return `<p>${inline(b.text).replaceAll('\n', '<br>')}</p>`;
  }).join('\n');
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const manifest: { file: string; title: string; characters: number; source: string; sourceHash: string; htmlHash: string }[] = [];
for (const key of files) {
  const rawSource = readFileSync(join(directory, key + '.md'), 'utf8');
  const source = rawSource.replaceAll('原資料', '원자료');
  const title = source.match(/^# (.+)$/m)?.[1] ?? key;
  const headings: { id: string; label: string }[] = [];
  const prepared = source.replace(/### 정답과 채점 기준\n([\s\S]*?)(?=\n## |$)/g, '<details>\n<summary>모두 푼 뒤 정답·채점 기준 보기</summary>\n$1\n</details>\n');
  const body = render(prepared, headings);
  const nav = `<details><summary>목차 · ${headings.length}개 항목</summary><nav aria-label="이 문서 목차">${headings.map(h => `<a href="#${h.id}">${inline(h.label)}</a>`).join('')}</nav></details>`;
  const firstHeading = body.match(/<h1>[\s\S]*?<\/h1>/)?.[0] ?? '';
  const content = body.replace(firstHeading, '');
  const html = `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${css}</style></head><body><main>${firstHeading}<p class="intro">교수님이 안내한 시험 범위에 맞춘 학습 자료입니다. 연습문제는 실제 시험 문제가 아닙니다. 먼저 답을 떠올린 다음 정답을 펼쳐보세요.</p>${nav}${content}</main></body></html>`;
  if (html.length > 100_000) throw new Error(key + ' exceeds document body limit; split before publishing.');
  const expectedCards = key === 'llm-qa' ? 46 : key === 'nlp-qa' ? 42 : 0;
  if (expectedCards && (body.match(/<details>/g) ?? []).length !== expectedCards) throw new Error(key + ' missing recall cards');
  if (/<script\b/i.test(html)) throw new Error('Unexpected script in ' + key);
  writeFileSync(join(directory, key + '.html'), html);
  manifest.push({ file: key + '.html', title, characters: html.length, source: key + '.md', sourceHash: hash(rawSource), htmlHash: hash(html) });
}
writeFileSync(join(directory, 'html-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
