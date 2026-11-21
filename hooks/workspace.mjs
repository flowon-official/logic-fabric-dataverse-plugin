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

// The offering this plugin builds for. workspace.yaml names the offering of the workspace, so the plugins of every
// Logic Fabric offering (the flagship's included) can share the logic-fabric/ folder convention: this plugin acts
// only in a workspace for its own offering, or in one that names none.
export const OFFERING = 'dataverse';

export function workspaceOffering(workspace) {
  const file = join(workspace, 'workspace.yaml');
  return existsSync(file) ? parseStatus(readFileSync(file, 'utf8')).offering || null : null;
}

export function isOwnWorkspace(workspace) {
  const offering = workspaceOffering(workspace);
  return !offering || offering === OFFERING;
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

// Why a change to Dataverse can't be made now, or no refusal when it can: the active change is in one of the
// allowed stages, its plan (its spec, for a quick change) is approved, and no approved file, spec or plan alike, has
// changed since (the plan is built from the spec). `what` names the change for the reasons, such as "Foundry save".
export function buildRefusal(workspace, what, allowed = ['build', 'review']) {
  const change = activeChange(workspace);

  if (!change) {
    return { refusal: `There is no active Logic Fabric change. Start one with /logic-fabric-dataverse:start; ${what} is allowed only in a change's build stage.` };
  }

  const status = readStatus(change.folder);
  const stage = status.stage || 'prompt';

  if (!allowed.includes(stage)) {
    return { refusal: `The change ${change.name} is in the ${stage} stage. ${what} is allowed only in ${allowed.join(' or ')}. Run /logic-fabric-dataverse:status to see what is open.` };
  }

  const quick = String(status.quick).toLowerCase() === 'true';
  const required = quick ? 'spec' : 'plan';

  if (!status[`${required}_sha256`]) {
    return { refusal: `The ${required} of ${change.name} isn't approved. Ask the owner to approve it first.` };
  }

  const approved = ['spec', 'plan']
    .filter(gate => status[`${gate}_sha256`])
    .map(gate => ({ name: `${gate}.md`, file: join(change.folder, `${gate}.md`), hash: status[`${gate}_sha256`].toLowerCase() }));

  for (const { name, file, hash } of approved) {
    if (sha256(file) !== hash) {
      return { refusal: `${name} changed since it was approved. Ask the owner to approve it again (an amendment) before building.` };
    }
  }

  return { refusal: null, change, approved };
}

// The environments in workspace.yaml: name -> { url, role, connection }. connection is the name of the environment
// variable that holds the environment's connection string, never the string itself.
export function readEnvironments(workspace) {
  const file = join(workspace, 'workspace.yaml');
  const environments = {};
  let inside = false;
  let current = null;

  for (const line of existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []) {
    if (/^environments:\s*(#.*)?$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside || /^\s*(#.*)?$/.test(line)) {
      continue;
    }
    if (/^\S/.test(line)) {
      break;
    }
    const name = /^ {2}([\w-]+):\s*(#.*)?$/.exec(line);
    if (name) {
      current = environments[name[1]] = {};
      continue;
    }
    const setting = /^ {4}([\w-]+):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (setting && current) {
      current[setting[1]] = setting[2].replace(/^["']|["']$/g, '');
    }
  }

  return environments;
}

// The artifacts the active change created (not ones it updated), as export.mjs lists them in
// <change>/artifacts/created.json: [{ kind, name, id }]. A change may delete these without a plan line.
export function createdFile(changeFolder) {
  return join(changeFolder, 'artifacts', 'created.json');
}

export function readCreated(changeFolder) {
  try {
    const file = createdFile(changeFolder);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  } catch {
    return [];
  }
}

// The stages in order; a change moves forward through them.
export const STAGES = ['prompt', 'spec', 'plan', 'build', 'review', 'acceptance', 'accepted'];

// The status.yaml of a change (logic-fabric/changes/<change>/status.yaml) in a workspace of this plugin's offering,
// as an absolute path; null for any other file.
export function changeStatusFile(cwd, path) {
  if (!path || basename(path) !== 'status.yaml') {
    return null;
  }
  const file = resolve(cwd || process.cwd(), path);
  const changes = dirname(dirname(file));
  return basename(changes) === 'changes' && basename(dirname(changes)) === 'logic-fabric' && isOwnWorkspace(dirname(changes)) ? file : null;
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
