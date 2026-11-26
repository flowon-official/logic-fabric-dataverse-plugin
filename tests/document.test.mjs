// node --test tests/: the requirements document's Word and PDF, from Markdown written to a temporary folder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { after, before, test } from 'node:test';
import { convert, findBrowser, headingPages, inlines, parse, toDocx, toHtml } from '../scripts/document.mjs';
import { CREDIT } from './credit-outline.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/document.mjs', import.meta.url));

const SAMPLE = [
  '# Claims: business requirements',
  '',
  '| | |',
  '|---|---|',
  '| Project | Claims |',
  '',
  '> **Read this first.** Two changes:',
  '>',
  '> - one',
  '> - two',
  '',
  '## 1. Business processes',
  '',
  'Text with **bold**, *italic*, `code`, a [link](https://example.com/a?b=1&c=2), a [file](changes/x.md), an escaped',
  '\\*star\\*, snake_case_name and 5 * 3.',
  '',
  '1. First',
  '   continued',
  '2. Second',
  '   - nested bullet',
  '     3. deep number',
  '3. Third',
  '',
  '- [ ] open task',
  '- [x] done task',
  '',
  '| # | Stage | Due |',
  '|:-:|---|--:|',
  '| 1 | Review \\| check | 2 days<br>then escalates |',
  '',
  '```',
  'code <here>',
  '```',
  '',
  '---',
  '',
  'مرحبا بالعالم',
  '',
].join('\n');

let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'lf-document-test-'));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// The files of a zip, by name, as the zip's directory lists them.
function unzip(buffer) {
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054B50);
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let k = 0; k < count; k++) {
    assert.equal(buffer.readUInt32LE(at), 0x02014B50);
    const crc = buffer.readUInt32LE(at + 16);
    const packed = buffer.readUInt32LE(at + 20);
    const name = buffer.toString('utf8', at + 46, at + 46 + buffer.readUInt16LE(at + 28));
    const local = buffer.readUInt32LE(at + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(buffer.subarray(start, start + packed));
    if (zlib.crc32) assert.equal(zlib.crc32(data), crc, `${name}: CRC-32`);
    files[name] = data.toString('utf8');
    at += 46 + buffer.readUInt16LE(at + 28) + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
  }
  return files;
}

// Every element closed, in order.
function assertWellFormed(name, xml) {
  const open = [];
  for (const [tag] of xml.matchAll(/<[^>]+>/g)) {
    if (tag.startsWith('<?') || tag.endsWith('/>')) continue;
    const element = /^<\/?([\w:.-]+)/.exec(tag)[1];
    if (tag.startsWith('</')) assert.equal(open.pop(), element, `${name}: </${element}>`);
    else open.push(element);
  }
  assert.deepEqual(open, [], `${name}: unclosed elements`);
}

test('the Markdown the documenter writes is read as blocks', () => {
  const blocks = parse(SAMPLE);
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'table', 'quote', 'heading', 'paragraph', 'list', 'list', 'table', 'code', 'rule', 'paragraph']);

  const [, facts, quote, , , numbered, tasks, stages, code] = blocks;
  assert.ok(facts.head.every(cell => cell.length === 0), 'a table with an empty header row');
  assert.deepEqual(quote.blocks.map(b => b.type), ['paragraph', 'list']);

  assert.equal(numbered.ordered, true);
  assert.equal(numbered.items.length, 3);
  assert.equal(numbered.items[0].inlines[0].text, 'First continued');
  const bullets = numbered.items[1].children[0];
  assert.equal(bullets.ordered, false);
  assert.equal(bullets.items[0].children[0].ordered, true);
  assert.equal(bullets.items[0].children[0].start, 3);

  assert.deepEqual(tasks.items.map(i => i.task), ['open', 'done']);
  assert.deepEqual(stages.align, ['center', null, 'right']);
  assert.equal(stages.rows[0][1][0].text, 'Review | check');
  assert.ok(stages.rows[0][2].some(r => r.br), 'a line break in a cell');
  assert.equal(code.text, 'code <here>');
});

test('bold, italic, code and links are runs; escapes, underscores in words and lone stars stay text', () => {
  const runs = parse(SAMPLE)[4].inlines;
  assert.ok(runs.some(r => r.bold && r.text === 'bold'));
  assert.ok(runs.some(r => r.italic && r.text === 'italic'));
  assert.ok(runs.some(r => r.code && r.text === 'code'));
  assert.ok(runs.some(r => r.href === 'https://example.com/a?b=1&c=2' && r.text === 'link'));
  assert.ok(runs.some(r => r.href === 'changes/x.md' && r.text === 'file'));
  const text = runs.filter(r => !r.href && !r.code && !r.bold && !r.italic).map(r => r.text).join('');
  assert.match(text, /\*star\*, snake_case_name and 5 \* 3\./);

  assert.deepEqual(inlines('**a *b* c**'), [{ bold: true, text: 'a ' }, { bold: true, italic: true, text: 'b' }, { bold: true, text: ' c' }]);
});

test('the Word document has its parts, well formed, with headings, lists, tables, links and right-to-left text', () => {
  const files = unzip(toDocx(parse(SAMPLE), { title: 'Claims: business requirements' }));
  assert.deepEqual(Object.keys(files).sort(), [
    '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml',
    'word/footer1.xml', 'word/numbering.xml', 'word/settings.xml', 'word/styles.xml',
  ]);
  for (const [name, xml] of Object.entries(files)) assertWellFormed(name, xml);

  const document = files['word/document.xml'];
  assert.match(document, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(document, /<w:pStyle w:val="Heading2"\/>/);
  assert.equal(document.match(/<w:tblHeader\/>/g).length, 1, 'only the table with a header row repeats it');
  assert.match(document, /<w:jc w:val="center"\/>/);
  assert.match(document, /<w:jc w:val="right"\/>/);
  assert.match(document, /<w:bidi\/>/);
  assert.match(document, /☐/);
  assert.match(document, /☑/);
  assert.match(document, /code &lt;here&gt;/);
  assert.match(document, /<w:hyperlink r:id="rIdLink1"/);

  const rels = files['word/_rels/document.xml.rels'];
  assert.match(rels, /Target="https:\/\/example\.com\/a\?b=1&amp;c=2" TargetMode="External"/);
  assert.doesNotMatch(rels, /changes\/x\.md/, 'a link to a repository file stays text');

  const numbering = files['word/numbering.xml'];
  assert.match(numbering, /<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"\/>/);
  assert.match(numbering, /<w:lvlOverride w:ilvl="2"><w:startOverride w:val="3"\/>/);
  assert.match(files['docProps/core.xml'], /<dc:title>Claims: business requirements<\/dc:title>/);
  assert.match(files['word/footer1.xml'], /Claims: business requirements/);
});

test('the PDF page has the tables, lists and links, escaped', () => {
  const html = toHtml(parse(SAMPLE), { title: 'Claims "BRD" </style>' });
  assert.equal(html.match(/<thead>/g).length, 1);
  assert.match(html, /<ol>/);
  assert.match(html, /<ol start="3">/);
  assert.match(html, /<li class="task" dir="auto"><span class="box">☐<\/span>open task/);
  assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2">link<\/a>/);
  assert.doesNotMatch(html, /href="changes/);
  assert.match(html, /code &lt;here&gt;/);
  assert.match(html, /2 days<br>then escalates/);
  assert.match(html, /<title>Claims &quot;BRD&quot; &lt;\/style&gt;<\/title>/);
  assert.equal(html.match(/<\/style>/g).length, 1, 'the title in the footer does not end the style');
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">/, 'no scripts, nothing loaded');
});

test('without a browser to print it, the PDF is left as a page to print', () => {
  const markdown = join(root, 'no-browser.md');
  writeFileSync(markdown, SAMPLE);
  const result = convert(markdown, 'pdf', { browser: null });
  assert.equal(result.format, 'html');
  assert.equal(result.file, join(root, 'no-browser.html'));
  assert.match(result.message, /print it to PDF/);
  assert.ok(existsSync(result.file));
  assert.ok(!existsSync(join(root, 'no-browser.pdf')));
});

test('Markdown is the document itself, and an unknown format or a missing file is refused', () => {
  const markdown = join(root, 'plain.md');
  writeFileSync(markdown, SAMPLE);
  assert.equal(convert(markdown, 'markdown').file, markdown);
  assert.throws(() => convert(markdown, 'rtf'), /Unknown format "rtf"/);
  assert.throws(() => convert(join(root, 'missing.md'), 'word'), /There is no document/);
});

test('the script writes the Word file next to the Markdown', () => {
  const markdown = join(root, '2026-11-26.md');
  writeFileSync(markdown, SAMPLE);
  const run = spawnSync(process.execPath, [SCRIPT, markdown, '--format', 'word'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Wrote .*2026-11-26\.docx/);
  assert.equal(readFileSync(join(root, '2026-11-26.docx')).subarray(0, 2).toString(), 'PK');

  const wrong = spawnSync(process.execPath, [SCRIPT, markdown, '--format', 'odt'], { encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /Unknown format/);
});

test('the browser is LF_BROWSER, else one found where it installs', () => {
  const fake = join(root, 'chromium');
  writeFileSync(fake, '');
  assert.equal(findBrowser({ PATH: root }, 'linux'), fake);
  assert.equal(findBrowser({ LF_BROWSER: fake, PATH: '' }, 'linux'), fake);
  assert.equal(findBrowser({ PATH: join(root, 'nothing') }, 'linux'), null);
});

// A document with sections, so it has contents, and a process diagram.
const LONG = [
  '# Lending: business requirements',
  '',
  'Front page.',
  '',
  '## 1. Business processes',
  '',
  '### 1.1 Credit approval',
  '',
  '```bpmn',
  CREDIT,
  '```',
  '',
  '## 2. Workflows',
  '',
  'Text.',
  '',
  '### 2.1 Submit',
  '',
  'Text.',
].join('\n');

test('the contents lists the level 2 and 3 headings before the first one, linked, with page numbers when known', () => {
  const blocks = parse(LONG);
  const html = toHtml(blocks, { title: 'Lending' });
  assert.ok(html.indexOf('<nav class="contents">') < html.indexOf('<h2 dir="auto" id="h1">'), 'before the first section');
  assert.ok(html.indexOf('Front page.') < html.indexOf('<nav class="contents">'), 'after the front page');
  assert.equal(html.match(/<li class="l[23]">/g).length, 4);
  assert.match(html, /<li class="l3"><a href="#h2"><span class="t">1.1 Credit approval<\/span><span class="d"><\/span><span class="n"><\/span>/);
  assert.match(toHtml(blocks, { title: 'Lending', pages: new Map([['h2', 7]]) }), /href="#h2">.*?<span class="n">7<\/span>/);
  assert.doesNotMatch(toHtml(parse(SAMPLE)), /class="contents"/, 'no contents for a document of one section');

  const files = unzip(toDocx(blocks, { title: 'Lending' }));
  const document = files['word/document.xml'];
  assert.match(document, /<w:instrText xml:space="preserve"> TOC \\o "2-3" \\h \\z \\u <\/w:instrText>/);
  assert.match(document, /<w:bookmarkStart w:id="2" w:name="_Toc_h2"\/>.*1.1 Credit approval.*<w:bookmarkEnd w:id="2"\/>/);
  assert.match(document, /<w:hyperlink w:anchor="_Toc_h2"/);
  assert.match(files['word/settings.xml'], /<w:updateFields w:val="true"\/>/, 'Word fills in the page numbers');
  assert.match(files['word/styles.xml'], /w:styleId="TOC3"/);
});

test('a ```bpmn block is a diagram: inline SVG in the PDF page, an SVG picture with a PNG in Word', () => {
  const blocks = parse(LONG);
  const diagram = blocks.find(b => b.type === 'diagram');
  assert.equal(diagram.title, 'Credit approval');
  assert.match(toHtml(blocks), /<figure class="diagram" role="img" aria-label="Credit approval" style="max-width:\d+px"><svg /);

  const png = Buffer.from('not really a png');
  const files = unzip(toDocx(blocks, { title: 'Lending', pictures: new Map([[diagram.svg, png]]) }));
  assert.equal(files['word/media/diagram1.svg'], diagram.svg);
  assert.equal(files['word/media/diagram1.png'], png.toString('utf8'));
  assert.match(files['word/document.xml'], /<wp:inline .*<a:blip r:embed="rIdImage1p"><a:extLst><a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}"><asvg:svgBlip [^>]*r:embed="rIdImage1s"\/>/);
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(files['word/document.xml']);
  assert.ok(Number(extent[1]) <= 9752 * 635, 'no wider than the page');
  assert.match(files['word/_rels/document.xml.rels'], /Id="rIdImage1s" Type="[^"]+\/image" Target="media\/diagram1.svg"/);
  assert.match(files['[Content_Types].xml'], /<Default Extension="svg" ContentType="image\/svg\+xml"\/>/);
  for (const [name, xml] of Object.entries(files)) if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormed(name, xml);

  const bare = unzip(toDocx(blocks, { title: 'Lending' }));
  assert.equal(bare['word/media/diagram1.png'].slice(1, 4), 'PNG', 'without a browser, a blank PNG stands in');
});

test('every format writes each process as a BPMN file; a mistake in an outline stops it, naming the line', () => {
  const markdown = join(root, 'lending.md');
  writeFileSync(markdown, LONG);
  const result = convert(markdown, 'markdown');
  assert.deepEqual(result.processes, [join(root, 'lending.credit-approval.bpmn')]);
  assert.match(readFileSync(result.processes[0], 'utf8'), /<bpmn:process id="Process_1" name="Credit approval"/);
  assert.match(result.message, /Wrote .*lending\.credit-approval\.bpmn/);

  const word = convert(markdown, 'word', { browser: null });
  assert.deepEqual(word.processes, result.processes);

  writeFileSync(markdown, LONG.replace('second -> approved2', 'second -> nowhere'));
  assert.throws(() => convert(markdown, 'word', { browser: null }), /BPMN outline, line \d+: "nowhere" isn't declared/);
});

test('the contents\' page numbers come from where the printed PDF put each heading', () => {
  const pdf = Buffer.from([
    '%PDF-1.4',
    '1 0 obj <</Type /Pages /Kids [2 0 R 3 0 R] /Count 2>> endobj',
    '2 0 obj <</Type /Page /Parent 1 0 R>> endobj',
    '3 0 obj <</Type /Page /Parent 1 0 R>> endobj',
    '4 0 obj <</h1 [2 0 R /XYZ 0 800 0] /h2 [3 0 R /XYZ 0 400 0]>> endobj',
  ].join('\n'), 'latin1');
  assert.deepEqual([...headingPages(pdf)], [['h1', 1], ['h2', 2]]);
  assert.equal(headingPages(Buffer.from('not a pdf')).size, 0);
});

const browser = findBrowser();

test('an installed browser prints the PDF', { skip: !browser && 'no Edge, Chrome or Chromium here' }, () => {
  const markdown = join(root, 'printed.md');
  writeFileSync(markdown, SAMPLE);
  const result = convert(markdown, 'pdf');
  assert.equal(result.format, 'pdf', result.message);
  assert.equal(readFileSync(result.file).subarray(0, 5).toString(), '%PDF-');

  const long = join(root, 'printed-long.md');
  writeFileSync(long, LONG);
  const printed = convert(long, 'pdf');
  assert.equal(printed.format, 'pdf', printed.message);
  assert.ok(headingPages(readFileSync(printed.file)).size >= 4, 'the contents found every heading');
});
