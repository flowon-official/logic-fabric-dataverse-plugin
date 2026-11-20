// Shared by the hooks: finds the Logic Fabric workspace and the active change, and reads status.yaml.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

// The folder holding logic-fabric/workspace.yaml, searching up from the session's directory; null if none.
export function findWorkspace(start) {
  let dir = resolve(start || process.cwd());
  for (;;) {
    if (existsSync(join(dir, 'logic-fabric', 'workspace.yaml'))) {
      return join(dir, 'logic-fabric');
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function activeChange(workspace) {
  const marker = join(workspace, '.active');
  if (!existsSync(marker)) {
    return null;
  }
  const name = readFileSync(marker, 'utf8').trim();
  const folder = join(workspace, 'changes', name);
  return name && existsSync(folder) ? { name, folder } : null;
}

// status.yaml is flat "key: value" lines; comments after # are ignored.
export function readStatus(folder) {
  const file = join(folder, 'status.yaml');
  return existsSync(file) ? parseStatus(readFileSync(file, 'utf8')) : {};
}

export function parseStatus(text) {
  const status = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (match) {
      status[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return status;
}

// The stages in order; a change moves forward through them.
export const STAGES = ['prompt', 'spec', 'plan', 'build', 'review', 'acceptance', 'accepted'];

// The status.yaml of a change (logic-fabric/changes/<change>/status.yaml) as an absolute path; null for any other file.
export function changeStatusFile(cwd, path) {
  if (!path || basename(path) !== 'status.yaml') {
    return null;
  }
  const file = resolve(cwd || process.cwd(), path);
  const changes = dirname(dirname(file));
  return basename(changes) === 'changes' && basename(dirname(changes)) === 'logic-fabric' ? file : null;
}

// SHA-256 of a file's text with line endings normalized to LF, so the hash is the same whether git checked the
// file out with CRLF or LF, and with task checkboxes cleared, so ticking a task in the approved plan (- [ ] to
// - [x]) isn't a change to what was approved. approval.mjs stamps approvals with it; gate.mjs and context.mjs
// compare against it.
export function sha256(file) {
  if (!existsSync(file)) {
    return null;
  }
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/^(\s*[-*+] )\[[xX]\]/gm, '$1[ ]');
  return createHash('sha256').update(text).digest('hex');
}

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text.trim() ? JSON.parse(text) : {};
}
