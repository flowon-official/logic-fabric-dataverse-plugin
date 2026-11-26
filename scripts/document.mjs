#!/usr/bin/env node
// Turns the business requirements document that /logic-fabric-dataverse:document writes (Markdown) into Word or PDF.
// It reads the Markdown the plugin writes: headings, paragraphs, lists (nested, numbered, task boxes), pipe tables,
// quotes, code blocks and rules, with bold, italic, code, links and <br> inside them.
//
//   node scripts/document.mjs <document.md> --format markdown|word|pdf
//
// The file is written next to the Markdown, with the same name (.docx or .pdf). Word: the .docx is built here, with no
// other program. PDF: the document becomes a web page that Microsoft Edge, Google Chrome or Chromium prints without
// opening a window (LF_BROWSER names another Chromium-based browser); when none can print it, the page is written as
// .html instead, to print from a browser. Before the first level 2 heading it adds the contents (level 2 and 3
// headings, with page numbers). A ```bpmn block (see bpmn.mjs) becomes a process diagram, and is also written as
// <document>.<process>.bpmn, in every format. It reads only the Markdown, writes only those files, and needs no network.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { drawProcess } from './bpmn.mjs';

export const FORMATS = { markdown: 'md', md: 'md', word: 'docx', docx: 'docx', pdf: 'pdf' };

// Writes the document in the format (markdown, word or pdf) next to the Markdown file; returns
// { file, format, message }. A browser of null prints nothing, as when none is installed.
export function convert(source, format, { browser } = {}) {
  const extension = FORMATS[String(format || 'markdown').toLowerCase()];

  if (!extension) {
    throw new Error(`Unknown format "${format}": use markdown, word or pdf.`);
  }

  const markdown = resolve(source);

  if (!existsSync(markdown)) {
    throw new Error(`There is no document at ${markdown}.`);
  }

  const text = readFileSync(markdown, 'utf8');
  const blocks = parse(text);
  const title = documentTitle(blocks) || basename(markdown, extname(markdown));
  const name = basename(markdown, extname(markdown));
  const target = join(dirname(markdown), `${name}.${extension}`);
  const diagrams = collect(blocks, 'diagram');

  // Each process diagram also as a BPMN file, in every format: <document>.<process>.bpmn.
  const processes = writeProcesses(diagrams, dirname(markdown), name);
  const done = first => [first, ...processes.map(p => `Wrote ${p}`)].join('\n');

  if (extension === 'md') {
    return { file: markdown, format: 'markdown', processes, message: done(`The document is Markdown already: ${markdown}`) };
  }

  if (extension === 'docx') {
    const pictures = diagrams.length ? picturesOf(diagrams, browser === undefined ? findBrowser() : browser) : new Map();
    save(target, toDocx(blocks, { title, pictures }));
    return { file: target, format: 'word', processes, message: done(`Wrote ${target}`) };
  }

  let html = toHtml(blocks, { title });
  const printer = browser === undefined ? findBrowser() : browser;
  let failure = printer ? printPdf(printer, html, target) : 'no Microsoft Edge, Google Chrome or Chromium was found';

  // The contents' page numbers: where the first print put each heading. The numbers' column is the same width
  // either way, so the second print breaks its pages in the same places.
  if (!failure && outline(blocks).at >= 0) {
    const pages = headingPages(readFileSync(target));
    if (pages.size) {
      html = toHtml(blocks, { title, pages });
      failure = printPdf(printer, html, target);
    }
  }

  if (!failure) {
    return { file: target, format: 'pdf', processes, message: done(`Wrote ${target}`) };
  }

  const page = join(dirname(markdown), `${name}.html`);
  save(page, html);
  return {
    file: page,
    format: 'html',
    processes,
    message: `Couldn't print the PDF: ${failure}. Wrote ${page} instead: open it in a browser and print it to PDF.${processes.map(p => `\nWrote ${p}`).join('')}`,
  };
}

// Writes each diagram's BPMN file next to the document, named after its process; returns the files.
function writeProcesses(diagrams, folder, name) {
  const used = new Set();
  return diagrams.map((d, k) => {
    const base = String(d.title || `process-${k + 1}`).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `process-${k + 1}`;
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    const file = join(folder, `${name}.${slug}.bpmn`);
    save(file, d.bpmn);
    return file;
  });
}

function save(file, data) {
  try {
    writeFileSync(file, data);
  } catch (error) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      throw new Error(`Couldn't write ${file}: close it if it's open (in Word or a PDF viewer) and run this again.`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Markdown to blocks:
//   { type: 'heading', level, inlines }   { type: 'paragraph', inlines }   { type: 'code', text }   { type: 'rule' }
//   { type: 'diagram', svg, width, height, title } from a ```bpmn block (scripts/bpmn.mjs)
//   { type: 'quote', blocks }              { type: 'table', head: [inlines], align: [left|center|right|null], rows }
//   { type: 'list', ordered, start, items: [{ task: null|'open'|'done', inlines, children: [list] }] }
// and inlines as runs: { text, bold, italic, code, href } or { br: true }.

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>/;
const LIST = /^\s*([-*+]|\d+[.)])\s+/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function parse(text) {
  return blocks(String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'));
}

function startsBlock(line) {
  return HEADING.test(line) || FENCE.test(line) || RULE.test(line) || QUOTE.test(line) || LIST.test(line) || /^\s*\|/.test(line);
}

function blocks(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;

    if (!line.trim()) {
      i++;
      continue;
    }

    if ((m = FENCE.exec(line))) {
      const body = [];
      const language = line.trim().slice(m[1].length).trim().toLowerCase();
      for (i++; i < lines.length && !lines[i].trim().startsWith(m[1]); i++) body.push(lines[i]);
      i++;
      out.push(language === 'bpmn' ? { type: 'diagram', ...drawProcess(body.join('\n')) } : { type: 'code', text: body.join('\n') });
      continue;
    }

    if ((m = HEADING.exec(line))) {
      out.push({ type: 'heading', level: m[1].length, inlines: inlines(m[2]) });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push({ type: 'rule' });
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && DELIMITER.test(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(c => {
        const t = c.trim();
        return t.endsWith(':') ? (t.startsWith(':') ? 'center' : 'right') : t.startsWith(':') ? 'left' : null;
      });
      const rows = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && !HEADING.test(lines[i]) && !FENCE.test(lines[i]) && !QUOTE.test(lines[i]); i++) {
        rows.push(cells(lines[i]).map(c => inlines(c.trim())));
      }
      out.push({ type: 'table', head: head.map(c => inlines(c.trim())), align, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/, ''));
      out.push({ type: 'quote', blocks: blocks(body) });
      continue;
    }

    if (LIST.test(line)) {
      const body = [];
      for (; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line inside a list: the list goes on if the next text is indented or another item.
          const next = lines.slice(i + 1).find(x => x.trim());
          if (next && (/^\s+\S/.test(next) || LIST.test(next))) continue;
          break;
        }
        if (body.length && !/^\s/.test(l) && !LIST.test(l)) break;
        body.push(l);
      }
      out.push(...lists(body));
      continue;
    }

    // A paragraph; a line ending in two spaces or a backslash breaks the line.
    const para = [];
    for (; i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines[i])); i++) para.push(lines[i]);
    const joined = para.map((l, k) => k < para.length - 1 && /( {2,}|\\)$/.test(l) ? `${l.replace(/( {2,}|\\)$/, '').trim()}<br>` : l.trim());
    out.push({ type: 'paragraph', inlines: inlines(joined.join(' ').replace(/<br> /g, '<br>')) });
  }

  return out;
}

// The items of one or more lists (a change of kind, bulleted or numbered, starts a new list), nested by indentation;
// lines without a marker continue the item above.
function lists(lines) {
  const items = [];
  for (const line of lines) {
    const m = ITEM.exec(line);
    if (m) {
      items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), start: parseInt(m[2], 10) || 1, text: [m[3]] });
    } else if (items.length) {
      items[items.length - 1].text.push(line.trim());
    }
  }

  let k = 0;
  const build = indent => {
    const list = { type: 'list', ordered: items[k].ordered, start: items[k].ordered ? items[k].start : 1, items: [] };
    while (k < items.length && items[k].indent >= indent) {
      const item = items[k];
      if (item.indent > indent) {
        const child = build(item.indent);
        if (list.items.length) list.items[list.items.length - 1].children.push(child);
        else list.items.push({ task: null, inlines: [], children: [child] });
        continue;
      }
      if (item.ordered !== list.ordered) break;
      k++;
      const text = item.text.join(' ');
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
      list.items.push({ task: task ? (task[1] === ' ' ? 'open' : 'done') : null, inlines: inlines(task ? task[2] : text), children: [] });
    }
    return list;
  };

  const out = [];
  while (k < items.length) out.push(build(items[k].indent));
  return out;
}

function cells(line) {
  const parts = [];
  let current = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (ch === '\\' && body[k + 1] === '|') {
      current += '|';
      k++;
      continue;
    }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

// Escaped characters are held as private-use characters while the inline marks are read, then given back.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;
const HELD = /[\uE000-\uE0FF]/g;
const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<br\s*\/?>|\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__(?!\w)|(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g;

export function inlines(source) {
  const held = String(source).replace(ESCAPED, (_, ch) => String.fromCharCode(0xE000 + ch.charCodeAt(0)));
  const runs = [];
  readInline(held, {}, runs);
  const give = s => s.replace(HELD, ch => String.fromCharCode(ch.charCodeAt(0) - 0xE000));
  return runs
    .map(r => r.br ? r : { ...r, text: give(r.text), ...(r.href ? { href: give(r.href) } : {}) })
    .filter(r => r.br || r.text);
}

function readInline(s, style, runs) {
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const [all, code, label, href, bold1, bold2, em1, em2] = m;
    if (m.index > last) runs.push({ ...style, text: s.slice(last, m.index) });
    if (code !== undefined) runs.push({ ...style, code: true, text: code });
    else if (label !== undefined) readInline(label, { ...style, href }, runs);
    else if (all.startsWith('<')) runs.push({ br: true });
    else if ((bold1 ?? bold2) !== undefined) readInline(bold1 ?? bold2, { ...style, bold: true }, runs);
    else readInline(em1 ?? em2, { ...style, italic: true }, runs);
    last = m.index + all.length;
  }
  if (last < s.length) runs.push({ ...style, text: s.slice(last) });
}

const plain = runs => runs.map(r => r.br ? ' ' : r.text).join('');

// The contents (the document's outline): its level 2 and 3 headings, each given an anchor, placed before the first
// level 2 heading. A document with fewer than three such headings has none.
function outline(blocks) {
  const entries = [];
  blocks.forEach((b, k) => {
    if (b.type === 'heading' && (b.level === 2 || b.level === 3)) {
      b.anchor = `h${entries.length + 1}`;
      entries.push({ level: b.level, text: plain(b.inlines).trim(), anchor: b.anchor, index: k });
    }
  });
  return { entries, at: entries.length >= 3 ? entries[0].index : -1 };
}

function documentTitle(blocks) {
  const heading = blocks.find(b => b.type === 'heading' && b.level === 1);
  return heading ? plain(heading.inlines).trim() : null;
}

// Only web and mail links become links; a link to a file in the repository stays its text.
const LINK = /^(https?:|mailto:)/i;

// Right-to-left text (Arabic, Hebrew and the like), for a paragraph whose first letter is one.
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function rightToLeft(runs) {
  const first = LETTER.exec(plain(runs));
  return Boolean(first && RTL.test(first[0]));
}

// Each column's share of a table's width, in characters of the table's text, of which a line holds about capacity
// (padding included). Every column first gets room for its longest word (up to 24 characters), so no word is split;
// what is left goes to the columns whose cells hold more text on average (up to 80 characters).
function columnShares(table, capacity) {
  const PADDING = 3;
  const columns = table.head.map((h, k) => {
    const head = plain(h).trim();
    const body = table.rows.map(r => plain(r[k] || []).trim()).filter(Boolean);
    const longest = list => list.flatMap(v => v.split(/\s+/)).reduce((most, word) => Math.max(most, word.length), 0);
    const word = Math.min(24, Math.max(1, longest(body), Math.ceil(longest([head]) * 1.1)));
    const average = body.length ? body.reduce((sum, v) => sum + v.length, 0) / body.length : head.length;
    return { least: word + PADDING, want: Math.max(word, Math.min(80, average)) + PADDING };
  });

  const least = columns.reduce((sum, c) => sum + c.least, 0);
  const want = columns.reduce((sum, c) => sum + c.want, 0);
  const room = capacity - least;
  const widths = room <= 0 ? columns.map(c => c.least)
    : want <= capacity ? columns.map(c => c.want + (capacity - want) * c.want / want)
    : columns.map(c => c.least + room * (c.want - c.least) / (want - least));
  const total = widths.reduce((sum, w) => sum + w, 0);
  return widths.map(w => w / total);
}

// ---------------------------------------------------------------------------------------------------------------
// HTML, printed to PDF

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(blocks, { title = 'Document', pages = new Map() } = {}) {
  const contents = { ...outline(blocks), pages };
  const footer = `"${String(title).replace(/[\\"]/g, '\\$&').replace(/</g, '\\3C ').replace(/\s+/g, ' ')}"`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(title)}</title>
<style>
@page { size: A4; margin: 18mm 16mm 20mm;
  @bottom-left { content: ${footer}; font: 8pt "Segoe UI", Arial, sans-serif; color: #667085; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Segoe UI", Arial, sans-serif; color: #667085; } }
html { font: 10pt/1.45 "Segoe UI", -apple-system, "Helvetica Neue", Arial, "Noto Sans", sans-serif; color: #1d2433;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; line-height: 1.25; }
h1 { font-size: 20pt; color: #1f3864; margin: 0 0 12pt; }
h2 { font-size: 15pt; color: #1f3864; margin: 20pt 0 8pt; padding-bottom: 3pt; border-bottom: 1px solid #d0d7e2; }
h3 { font-size: 12.5pt; color: #2f5496; margin: 16pt 0 6pt; }
h4 { font-size: 11pt; color: #2f5496; margin: 12pt 0 4pt; }
h5, h6 { font-size: 10pt; margin: 10pt 0 4pt; }
p { margin: 0 0 6pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 6pt; padding-left: 18pt; }
li { margin: 2pt 0; }
li.task { list-style: none; }
li.task > .box { display: inline-block; width: 14pt; margin-left: -14pt; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8.5pt; line-height: 1.35; }
th, td { border: 0.75pt solid #c9ced6; padding: 3pt 5pt; vertical-align: top; text-align: start; overflow-wrap: break-word; }
th { background: #eef1f5; font-weight: 600; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
blockquote { margin: 6pt 0 10pt; padding: 6pt 10pt; border-left: 3pt solid #8ea4c8; background: #f5f7fa; }
blockquote > :last-child { margin-bottom: 0; }
pre { font: 8.5pt/1.4 Consolas, "Cascadia Mono", Menlo, monospace; background: #f3f4f6; padding: 6pt 8pt; white-space: pre-wrap; border-radius: 3pt; }
code { font-family: Consolas, "Cascadia Mono", Menlo, monospace; font-size: 0.92em; background: #f3f4f6; padding: 0 2pt; border-radius: 2pt; }
pre code { background: none; padding: 0; font-size: inherit; }
hr { border: 0; border-top: 1px solid #d0d7e2; margin: 10pt 0; }
a { color: #0b57d0; text-decoration: none; }
nav.contents { margin: 0; break-before: page; break-after: page; }
nav.contents h2 { border: 0; }
nav.contents ol { list-style: none; padding: 0; margin: 0; }
nav.contents li { margin: 0; padding: 1.5pt 0; }
nav.contents li.l3 { padding-left: 14pt; font-size: 9.5pt; }
nav.contents a { color: inherit; display: flex; align-items: baseline; }
nav.contents .d { flex: 1; border-bottom: 0.75pt dotted #98a2b3; margin: 0 4pt; min-width: 12pt; }
nav.contents .n { min-width: 16pt; text-align: right; }
figure.diagram { margin: 6pt auto 12pt; break-inside: avoid; }
figure.diagram svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
${htmlBlocks(blocks, contents)}
</body>
</html>
`;
}

function htmlBlocks(blocks, contents = { at: -1 }) {
  return blocks.map((b, k) => (k === contents.at ? htmlContents(contents.entries, contents.pages) : '') + htmlBlock(b)).join('\n');
}

function htmlContents(entries, pages = new Map()) {
  const items = entries.map(e => `<li class="l${e.level}"><a href="#${e.anchor}"><span class="t">${esc(e.text)}</span><span class="d"></span><span class="n">${pages.get(e.anchor) || ''}</span></a></li>`).join('');
  return `<nav class="contents"><h2>Contents</h2><ol>${items}</ol></nav>\n`;
}

function htmlBlock(b) {
  switch (b.type) {
      case 'heading': return `<h${b.level} dir="auto"${b.anchor ? ` id="${b.anchor}"` : ''}>${htmlRuns(b.inlines)}</h${b.level}>`;
      case 'diagram': return `<figure class="diagram" role="img" aria-label="${esc(b.title || 'Process diagram')}" style="max-width:${b.width}px">${b.svg}</figure>`;
      case 'paragraph': return `<p dir="auto">${htmlRuns(b.inlines)}</p>`;
      case 'code': return `<pre><code>${esc(b.text)}</code></pre>`;
      case 'rule': return '<hr>';
      case 'quote': return `<blockquote>${htmlBlocks(b.blocks)}</blockquote>`;
      case 'list': return htmlList(b);
      case 'table': return htmlTable(b);
      default: return '';
  }
}

function htmlRuns(runs) {
  return runs.map(r => {
    if (r.br) return '<br>';
    let h = esc(r.text);
    if (r.code) h = `<code>${h}</code>`;
    if (r.italic) h = `<em>${h}</em>`;
    if (r.bold) h = `<strong>${h}</strong>`;
    if (r.href && LINK.test(r.href)) h = `<a href="${esc(r.href)}">${h}</a>`;
    return h;
  }).join('');
}

function htmlList(list) {
  const tag = list.ordered ? 'ol' : 'ul';
  const start = list.ordered && list.start !== 1 ? ` start="${list.start}"` : '';
  const items = list.items.map(item => {
    const box = item.task ? `<span class="box">${item.task === 'done' ? '\u2611' : '\u2610'}</span>` : '';
    return `<li${item.task ? ' class="task"' : ''} dir="auto">${box}${htmlRuns(item.inlines)}${item.children.map(htmlList).join('')}</li>`;
  });
  return `<${tag}${start}>${items.join('')}</${tag}>`;
}

function htmlTable(table) {
  const align = k => table.align[k] ? ` style="text-align:${table.align[k]}"` : '';
  // A page's width (178 mm) holds about 115 characters of 8.5 pt text.
  const cols = columnShares(table, 115).map(s => `<col style="width:${(100 * s).toFixed(1)}%">`).join('');
  const head = table.head.some(c => plain(c).trim())
    ? `<thead><tr>${table.head.map((c, k) => `<th${align(k)} dir="auto">${htmlRuns(c)}</th>`).join('')}</tr></thead>`
    : '';
  const rows = table.rows.map(r => `<tr>${table.head.map((_, k) => `<td${align(k)} dir="auto">${htmlRuns(r[k] || [])}</td>`).join('')}</tr>`);
  return `<table><colgroup>${cols}</colgroup>${head}<tbody>${rows.join('')}</tbody></table>`;
}

// The installed browser that prints PDFs: LF_BROWSER, else Microsoft Edge, Google Chrome or Chromium.
export function findBrowser(env = process.env, platform = process.platform) {
  const candidates = [env.LF_BROWSER];

  if (platform === 'win32') {
    const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
    candidates.push(...roots.map(root => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')));
    candidates.push(...roots.map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')));
    candidates.push(...roots.map(root => join(root, 'Chromium', 'Application', 'chrome.exe')));
  } else if (platform === 'darwin') {
    for (const app of ['Microsoft Edge', 'Google Chrome', 'Chromium']) {
      candidates.push(`/Applications/${app}.app/Contents/MacOS/${app}`);
      if (env.HOME) candidates.push(join(env.HOME, 'Applications', `${app}.app`, 'Contents', 'MacOS', app));
    }
  } else {
    const names = ['microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    const dirs = String(env.PATH || '').split(delimiter).filter(Boolean);
    candidates.push(...names.flatMap(name => dirs.map(dir => join(dir, name))));
  }

  return candidates.filter(Boolean).find(path => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }) || null;
}

// Every block of a type, quotes included.
function collect(blocks, type) {
  return blocks.flatMap(b => b.type === type ? [b] : b.type === 'quote' ? collect(b.blocks, type) : []);
}

// PNG copies of the diagrams for Word readers that can't draw SVG, made by the browser (at twice the size, for print);
// a map from each diagram's SVG to its PNG. Without a browser, or when it fails, the map lacks it.
function picturesOf(diagrams, browser) {
  const pictures = new Map();
  if (!browser) return pictures;
  const work = mkdtempSync(join(tmpdir(), 'lf-document-'));
  try {
    diagrams.forEach((d, k) => {
      const page = join(work, `diagram${k}.html`);
      const png = join(work, `diagram${k}.png`);
      writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${d.svg}</body></html>`);
      const shoot = sandbox => spawnSync(browser, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--disable-background-networking', '--disable-sync', `--user-data-dir=${join(work, 'profile')}`, '--hide-scrollbars',
        `--window-size=${d.width},${d.height}`, '--force-device-scale-factor=2', '--default-background-color=FFFFFFFF',
        ...(sandbox ? [] : ['--no-sandbox']), `--screenshot=${png}`, pathToFileURL(page).href,
      ], { stdio: 'ignore', timeout: 60000, windowsHide: true });
      shoot(true);
      if (!existsSync(png) && process.platform === 'linux') shoot(false);
      if (existsSync(png) && statSync(png).size > 0) pictures.set(d.svg, readFileSync(png));
    });
  } finally {
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // A browser still closing can hold the folder for a moment; the system's temp cleanup takes it.
    }
  }
  return pictures;
}

// The page each contents heading starts on, from a PDF Chromium printed: its named destinations (h1, h2, ...) point
// at page objects, numbered in the order of the page tree. Anything unexpected gives an empty map (no numbers).
export function headingPages(pdf) {
  const pages = new Map();
  try {
    const text = pdf.toString('latin1');
    const objects = new Map();
    for (const m of text.matchAll(/(?:^|[\r\n])(\d+) 0 obj\b([\s\S]*?)endobj/g)) objects.set(m[1], m[2]);
    const order = [];
    const walk = (id, depth) => {
      const body = objects.get(id) || '';
      if (depth > 20) return;
      if (/\/Type\s*\/Pages\b/.test(body)) {
        const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body);
        for (const k of kids ? kids[1].matchAll(/(\d+) 0 R/g) : []) walk(k[1], depth + 1);
      } else if (/\/Type\s*\/Page\b/.test(body)) {
        order.push(id);
      }
    };
    const root = [...objects].find(([, body]) => /\/Type\s*\/Pages\b/.test(body) && !/\/Parent\b/.test(body));
    if (root) walk(root[0], 0);
    for (const m of text.matchAll(/\/(h\d+)\s*\[\s*(\d+) 0 R/g)) {
      const page = order.indexOf(m[2]);
      if (page >= 0 && !pages.has(m[1])) pages.set(m[1], page + 1);
    }
  } catch {
    pages.clear();
  }
  return pages;
}

// Prints the page to the PDF file with the browser, headless, with a profile of its own that is deleted after;
// returns null, or why it couldn't. Where Linux doesn't let the browser start its sandbox (as on Ubuntu, which
// restricts the namespaces it needs), it prints again without one: the page is the script's own, with no scripts and
// nothing to load (its content security policy allows neither).
function printPdf(browser, html, pdf) {
  const work = mkdtempSync(join(tmpdir(), 'lf-document-'));

  try {
    const page = join(work, 'document.html');
    writeFileSync(page, html);
    try {
      rmSync(pdf, { force: true });
    } catch {
      return `${pdf} is open in another program; close it and run this again`;
    }

    const print = sandbox => spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', `--user-data-dir=${join(work, 'profile')}`,
      '--no-pdf-header-footer', '--print-to-pdf-no-header', '--generate-pdf-document-outline',
      ...(sandbox ? [] : ['--no-sandbox']), `--print-to-pdf=${pdf}`, pathToFileURL(page).href,
    ], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000, windowsHide: true });
    const printed = () => existsSync(pdf) && statSync(pdf).size > 0;

    let result = print(true);
    if (!printed() && !result.error && process.platform === 'linux') {
      result = print(false);
    }

    if (printed()) {
      return null;
    }

    if (result.error) {
      return `${basename(browser)} didn't run (${result.error.code || result.error.message})`;
    }

    // The browser's last error, without its [process:thread:time:LEVEL:source] prefix.
    const errors = String(result.stderr || '').split('\n').map(l => l.replace(/^\[[^\]]*\]\s*/, '').trim()).filter(l => /error|fatal|sandbox|denied|failed/i.test(l));
    return `${basename(browser)} didn't write it${errors.length ? ` (${errors[errors.length - 1].slice(0, 200)})` : ''}`;
  } finally {
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // A profile the browser still holds stays in the temporary folder.
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Word (.docx): WordprocessingML in a zip, A4 with 2 cm margins, the title and page numbers in the footer.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const WIDTH = 9752; // A4 (11906 twips) less 1077 on each side
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const SVG_BLIP = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
// A transparent pixel: the picture Word shows when it can't draw SVG and no browser made a PNG of the diagram.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ALIGN = { left: 'left', center: 'center', right: 'right' };
const SPACER = '<w:p><w:pPr><w:pStyle w:val="Spacer"/></w:pPr></w:p>';

const xml = s => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toDocx(blocks, { title = 'Document', created = new Date(), pictures = new Map() } = {}) {
  const context = { width: WIDTH, links: [], numbers: [], images: [], pictures };
  const contents = outline(blocks);
  const body = wBlocks(blocks, context, false, contents) || '<w:p/>';
  const document = `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1077" w:bottom="1134" w:left="1077" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const images = context.images.map(img => `<Relationship Id="${img.id}" Type="${REL}/image" Target="media/${img.file}"/>`).join('');
  const links = context.links.map((href, k) => `<Relationship Id="rIdLink${k + 1}" Type="${REL}/hyperlink" Target="${xml(href)}" TargetMode="External"/>`).join('');
  const when = created.toISOString().replace(/\.\d+Z$/, 'Z');
  const footer = `${XML}<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">${xml(title)}</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;

  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`],
    ['word/document.xml', document],
    ['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="${REL}/footer" Target="footer1.xml"/>${links}${images}</Relationships>`],
    ['word/styles.xml', STYLES],
    ['word/numbering.xml', numbering(context.numbers)],
    ['word/settings.xml', `${XML}<w:settings xmlns:w="${W}">${contents.at >= 0 ? '<w:updateFields w:val="true"/>' : ''}<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['word/footer1.xml', footer],
    ...context.images.map(img => [`word/media/${img.file}`, img.data]),
  ]);
}

function wBlocks(blocks, context, quoted, contents = { at: -1 }) {
  return blocks.map((b, k) => {
    const before = k === contents.at ? wContents(contents.entries) : '';
    return before + wBlock(b, context, quoted);
  }).join('');
}

// A TOC field over the level 2 and 3 headings, with the entries already in it (as links) so it reads well before
// Word updates the page numbers.
function wContents(entries) {
  const field = (instr, inner) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${inner}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const items = entries.map((e, k) => {
    const link = `<w:hyperlink w:anchor="_Toc_${e.anchor}" w:history="1"><w:r><w:t xml:space="preserve">${xml(e.text)}</w:t></w:r><w:r><w:tab/></w:r>${field(`PAGEREF _Toc_${e.anchor} \\h`, '<w:r><w:t></w:t></w:r>')}</w:hyperlink>`;
    const begin = k === 0 ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "2-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` : '';
    const end = k === entries.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    return `<w:p><w:pPr><w:pStyle w:val="TOC${e.level}"/></w:pPr>${begin}${link}${end}</w:p>`;
  }).join('');
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + wParagraph(wTextRun('Contents'), { style: 'TOCHeading' }) + items + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

// A process diagram as an inline picture, as wide as the page at most.
function wDiagram(b, context) {
  const n = context.images.length / 2 + 1;
  const svgId = `rIdImage${n}s`;
  const pngId = `rIdImage${n}p`;
  context.images.push({ id: svgId, file: `diagram${n}.svg`, data: Buffer.from(b.svg, 'utf8') });
  context.images.push({ id: pngId, file: `diagram${n}.png`, data: context.pictures.get(b.svg) || PIXEL });
  const scale = Math.min(1, (context.width * 635) / (b.width * 9525));
  const cx = Math.round(b.width * 9525 * scale);
  const cy = Math.round(b.height * 9525 * scale);
  const name = xml(b.title || `Process diagram ${n}`);
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="60" w:after="160"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${n}" name="${name}" descr="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="diagram${n}.svg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${pngId}"><a:extLst><a:ext uri="${SVG_BLIP}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgId}"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function wBlock(b, context, quoted) {
  {
    switch (b.type) {
      case 'heading': {
        const runs = wRuns(b.inlines, context);
        const marked = b.anchor ? `<w:bookmarkStart w:id="${b.anchor.slice(1)}" w:name="_Toc_${b.anchor}"/>${runs}<w:bookmarkEnd w:id="${b.anchor.slice(1)}"/>` : runs;
        return wParagraph(marked, { style: `Heading${b.level}`, bidi: rightToLeft(b.inlines) });
      }
      case 'diagram': return wDiagram(b, context);
      case 'paragraph': return wParagraph(wRuns(b.inlines, context), { style: quoted ? 'QuoteText' : null, bidi: rightToLeft(b.inlines) });
      case 'code': return wParagraph(b.text.split('\n').map((line, k) => `${k ? '<w:r><w:br/></w:r>' : ''}${wTextRun(line)}`).join(''), { style: 'Code' });
      case 'rule': return wParagraph('', { style: 'Rule' });
      case 'list': return wList(b, context, 0);
      case 'table': return wTable(b, context) + SPACER;
      case 'quote': return wQuote(b, context) + SPACER;
      default: return '';
    }
  }
}

function wParagraph(runs, { style, numbered, level = 0, indent, jc, bidi } = {}) {
  const props = [];
  if (style) props.push(`<w:pStyle w:val="${style}"/>`);
  if (numbered) props.push(`<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numbered}"/></w:numPr>`);
  if (bidi) props.push('<w:bidi/>');
  if (indent) props.push(indent);
  if (jc) props.push(`<w:jc w:val="${jc}"/>`);
  return `<w:p>${props.length ? `<w:pPr>${props.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

function wTextRun(text, props = '') {
  const parts = String(text).split('\t').map(part => `<w:t xml:space="preserve">${xml(part)}</w:t>`).join('<w:tab/>');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts}</w:r>`;
}

function wRuns(runs, context, { bold = false } = {}) {
  return runs.map(r => {
    if (r.br) return '<w:r><w:br/></w:r>';
    const link = r.href && LINK.test(r.href);
    const props = [];
    if (r.code) props.push('<w:rStyle w:val="CodeChar"/>');
    else if (link) props.push('<w:rStyle w:val="Hyperlink"/>');
    if (r.bold || bold) props.push('<w:b/><w:bCs/>');
    if (r.italic) props.push('<w:i/><w:iCs/>');
    if (RTL.test(r.text) && !/[A-Za-z]/.test(r.text)) props.push('<w:rtl/>');
    const run = wTextRun(r.text, props.join(''));
    if (!link) return run;
    context.links.push(r.href);
    return `<w:hyperlink r:id="rIdLink${context.links.length}" w:history="1">${run}</w:hyperlink>`;
  }).join('');
}

// Bulleted lists share one numbering; each numbered list has its own, starting at its first number.
function wList(list, context, depth) {
  const level = Math.min(depth, 8);
  let numbered = 1;
  if (list.ordered) {
    context.numbers.push({ level, start: list.start });
    numbered = context.numbers.length + 1;
  }

  return list.items.map(item => {
    const runs = wRuns(item.inlines, context);
    const bidi = rightToLeft(item.inlines);
    const paragraph = item.task
      ? wParagraph(`<w:r><w:t>${item.task === 'done' ? '\u2611' : '\u2610'}</w:t></w:r><w:r><w:tab/></w:r>${runs}`, { style: 'ListParagraph', bidi, indent: `<w:ind w:left="${360 * (level + 1)}" w:hanging="360"/>` })
      : wParagraph(runs, { style: 'ListParagraph', numbered, level, bidi });
    return paragraph + item.children.map(child => wList(child, context, depth + 1)).join('');
  }).join('');
}

function wTable(table, context) {
  // 9 pt text: about 90 twips a character.
  const widths = columnShares(table, context.width / 90).map(s => Math.max(360, Math.round(s * context.width)));
  const width = widths.reduce((sum, w) => sum + w, 0);
  const line = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9CED6"/>`;
  const props = `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(line).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const grid = `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const cell = (runs, k, header) => `<w:tc><w:tcPr><w:tcW w:w="${widths[k]}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/>' : ''}</w:tcPr>${wParagraph(wRuns(runs, context, { bold: header }), { style: 'TableText', jc: ALIGN[table.align[k]], bidi: rightToLeft(runs) })}</w:tc>`;
  const head = table.head.some(c => plain(c).trim())
    ? `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${table.head.map((c, k) => cell(c, k, true)).join('')}</w:tr>`
    : '';
  const rows = table.rows.map(r => `<w:tr>${table.head.map((_, k) => cell(r[k] || [], k, false)).join('')}</w:tr>`).join('');
  return `<w:tbl>${props}${grid}${head}${rows}</w:tbl>`;
}

// A quote is a one-cell table, shaded, with a bar on its left.
function wQuote(quote, context) {
  const width = context.width;
  context.width = width - 340;
  const inner = wBlocks(quote.blocks, context, true);
  context.width = width;
  return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders><w:left w:val="single" w:sz="18" w:space="0" w:color="8EA4C8"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F5F7FA"/></w:tcPr>${inner.endsWith('</w:p>') ? inner : `${inner}<w:p/>`}</w:tc></w:tr></w:tbl>`;
}

function numbering(numbers) {
  const levels = bullet => Array.from({ length: 9 }, (_, l) => {
    // Numbers at every level, as in the PDF.
    const format = bullet ? 'bullet' : 'decimal';
    const text = bullet ? ['\u2022', '\u25E6', '\u25AA'][l % 3] : `%${l + 1}.`;
    const font = bullet ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:hint="default"/></w:rPr>' : '';
    return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (l + 1)}" w:hanging="360"/></w:pPr>${font}</w:lvl>`;
  }).join('');
  const instances = numbers.map((n, k) => `<w:num w:numId="${k + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride></w:num>`).join('');
  return `${XML}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${instances}</w:numbering>`;
}

const heading = (level, size, color, extra = '') => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>${extra}<w:spacing w:before="${level < 3 ? 360 : 240}" w:after="${level < 3 ? 120 : 80}"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `${XML}<w:styles xmlns:w="${W}">`
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Arial"/><w:color w:val="1D2433"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
  + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
  + '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
  + heading(1, 36, '1F3864')
  + heading(2, 30, '1F3864', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="D0D7E2"/></w:pBdr>')
  + heading(3, 25, '2F5496')
  + heading(4, 22, '2F5496')
  + heading(5, 21, '1D2433')
  + heading(6, 21, '1D2433')
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading2"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>'
  + `<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${WIDTH}"/></w:tabs><w:spacing w:before="40" w:after="20"/></w:pPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="TOC3"><w:name w:val="toc 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${WIDTH}"/></w:tabs><w:spacing w:after="0"/><w:ind w:left="280"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>`
  + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="QuoteText"><w:name w:val="Quote Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:color w:val="33415C"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:before="60" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="160" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Rule"><w:name w:val="Rule"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D7E2"/></w:pBdr><w:spacing w:after="200"/></w:pPr></w:style>'
  + `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:pos="${WIDTH}"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="667085"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>`
  + '<w:style w:type="character" w:customStyle="1" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:rPr></w:style>'
  + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0B57D0"/><w:u w:val="single"/></w:rPr></w:style>'
  + '</w:styles>';

// A zip of the files (deflated), with CRC-32s, as Word reads it.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (const byte of data) c = CRC[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const packed = deflateRawSync(data);
    const path = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    locals.push(local, path, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, path);

    offset += local.length + path.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

// ---------------------------------------------------------------------------------------------------------------

function main(args) {
  const at = args.indexOf('--format');
  const format = at >= 0 ? args[at + 1] : 'markdown';
  const file = args.find((arg, k) => !arg.startsWith('--') && k !== at + 1);

  if (!file) {
    console.error('Usage: node document.mjs <document.md> --format word|pdf');
    process.exit(2);
  }

  try {
    console.log(convert(file, format).message);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// Run as a script (not when a test imports it).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
