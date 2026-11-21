// PostToolUse export for Logic Foundry's save and delete. A save writes the saved artifact's canonical source (from
// the tool's response) to <change>/artifacts/<kind>/<name>.json, so reviews and pull requests diff what is really
// saved; when the save created the artifact, it is also listed in <change>/artifacts/created.json, which lets the
// change delete it again without a plan line (gate.mjs). A delete removes the artifact's source file and its entry.
// Does nothing outside a workflow repository or without an active change.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeChange, createdFile, findWorkspace, isOwnWorkspace, readCreated, readInput } from './workspace.mjs';

const SCHEMA = ['table', 'column', 'choice', 'relationship', 'record'];

// MCP tool responses arrive as content blocks; the result is the JSON in the first text block.
function resultOf(response) {
  if (!response) {
    return null;
  }
  if (response.structuredContent) {
    return response.structuredContent;
  }
  const blocks = Array.isArray(response) ? response : response.content;
  const text = Array.isArray(blocks) ? blocks.find(b => b && b.type === 'text')?.text : (typeof response === 'string' ? response : null);
  try {
    return text ? JSON.parse(text) : (typeof response === 'object' ? response : null);
  } catch {
    return null;
  }
}

const safe = name => String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

function writeCreated(changeFolder, entries) {
  mkdirSync(join(changeFolder, 'artifacts'), { recursive: true });
  writeFileSync(createdFile(changeFolder), JSON.stringify(entries, null, 2) + '\n');
}

try {
  const input = await readInput();
  const tool = String(input.tool_name || '').split('__').pop();
  const result = resultOf(input.tool_response);
  const workspace = findWorkspace(input.cwd);
  const change = workspace && isOwnWorkspace(workspace) && activeChange(workspace);

  if (result && change && tool === 'save' && result.source) {
    const kind = result.kind || result.source.kind;
    const name = result.name || result.source.name;
    const folder = join(change.folder, 'artifacts', SCHEMA.includes(kind) ? 'schema' : kind);

    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${safe(kind === 'column' ? `${result.source.table}.${name}` : name)}.json`), JSON.stringify(result.source, null, 2) + '\n');

    if (result.created && !SCHEMA.includes(kind)) {
      const entries = readCreated(change.folder).filter(e => !(e.kind === kind && e.name === name));
      writeCreated(change.folder, [...entries, { kind, name, id: result.id }]);
    }
  }

  if (result && change && tool === 'delete' && result.deleted && !SCHEMA.includes(result.kind)) {
    const entries = readCreated(change.folder);
    const entry = entries.find(e => e.kind === result.kind && (e.id === result.id || e.name === result.name));
    const name = result.name || entry?.name;

    if (name) {
      rmSync(join(change.folder, 'artifacts', result.kind, `${safe(name)}.json`), { force: true });
    }

    if (entry) {
      writeCreated(change.folder, entries.filter(e => e !== entry));
    }
  }
} catch {
  // The export never blocks a save or a delete; a failure here only means a source file isn't written or removed.
}

process.exit(0);
