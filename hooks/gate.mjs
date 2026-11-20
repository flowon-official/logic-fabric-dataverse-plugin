// PreToolUse gate for Logic Foundry tools. Reads are always allowed. Writes (save, delete, release, test, and run
// of a logic flow, which commits) are allowed only when the repository uses the workflow's change folders and:
// the active change is in the build stage (review for fix tasks; acceptance for test runs), the plan is approved
// (the spec, for a quick change), no approved file (spec or plan) has changed since, and a delete is listed in one.
// A repository without logic-fabric/workspace.yaml hasn't adopted the workflow, and nothing is refused.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeChange, findWorkspace, readInput, readStatus, sha256 } from './workspace.mjs';

const WRITES = new Set(['save', 'delete', 'release', 'test']);

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

const input = await readInput();
const tool = String(input.tool_name || '').split('__').pop();
const args = input.tool_input || {};
const isWrite = WRITES.has(tool) || (tool === 'run' && String(args.kind || '').toLowerCase() === 'logicflow');

if (!isWrite) {
  process.exit(0);
}

const workspace = findWorkspace(input.cwd);

if (!workspace) {
  process.exit(0);
}

const change = activeChange(workspace);

if (!change) {
  deny('There is no active Logic Fabric change. Start one with /logic-fabric-dataverse:start; Foundry writes happen only in a change\'s build stage.');
}

const status = readStatus(change.folder);
const stage = status.stage || 'prompt';
const allowed = tool === 'test' ? ['build', 'review', 'acceptance'] : ['build', 'review'];

if (!allowed.includes(stage)) {
  deny(`The change ${change.name} is in the ${stage} stage. Foundry ${tool} is allowed only in ${allowed.join(' or ')}. Run /logic-fabric-dataverse:status to see what is open.`);
}

// The build needs the plan approved (the spec, for a quick change). Every file that was approved, spec and plan
// alike, must be unchanged since: the plan is built from the spec.
const quick = String(status.quick).toLowerCase() === 'true';
const required = quick ? 'spec' : 'plan';

if (!status[`${required}_sha256`]) {
  deny(`The ${required} of ${change.name} isn't approved. Ask the owner to approve it first.`);
}

const approved = ['spec', 'plan']
  .filter(gate => status[`${gate}_sha256`])
  .map(gate => ({ name: `${gate}.md`, file: join(change.folder, `${gate}.md`), hash: status[`${gate}_sha256`].toLowerCase() }));

for (const { name, file, hash } of approved) {
  if (sha256(file) !== hash) {
    deny(`${name} changed since it was approved. Ask the owner to approve it again (an amendment) before building.`);
  }
}

if (tool === 'delete') {
  // Listed when a line of an approved file names the target with "delete" (or deleted, deletes, deleting, deletion).
  const target = String(args.name || args.id || '').trim();
  const listed = target && approved.some(({ file }) =>
    readFileSync(file, 'utf8').split(/\r?\n/).some(line => /\bdelet(e|ed|es|ing|ion)\b/i.test(line) && line.includes(target)));

  if (!listed) {
    deny(`Deleting '${target}' isn't in an approved file of ${change.name}. Add a line "Delete <kind> ${target}: <reason>" to the plan's summary (plan.md, or spec.md for a quick change without a plan) and get it approved.`);
  }
}

process.exit(0);
