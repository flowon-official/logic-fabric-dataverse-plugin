// PostToolUse export for Logic Foundry's save: writes the saved artifact's canonical source (from the tool's
// response) to <change>/artifacts/<kind>/<name>.json, so reviews and pull requests diff what is really saved.
// Does nothing outside a workflow repository or without an active change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeChange, findWorkspace, readInput } from './workspace.mjs';

// MCP tool responses arrive as content blocks; the save result is the JSON in the first text block.
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

try {
  const input = await readInput();
  const result = resultOf(input.tool_response);
  const workspace = findWorkspace(input.cwd);
  const change = workspace && activeChange(workspace);

  if (result && result.source && change) {
    const kind = result.kind || result.source.kind;
    const name = result.name || result.source.name;
    const folder = join(change.folder, 'artifacts', ['table', 'column', 'choice', 'relationship', 'record'].includes(kind) ? 'schema' : kind);

    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${safe(kind === 'column' ? `${result.source.table}.${name}` : name)}.json`), JSON.stringify(result.source, null, 2) + '\n');
  }
} catch {
  // The export never blocks the save; a failure here only means the source file isn't written.
}

process.exit(0);
