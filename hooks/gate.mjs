// PreToolUse gate for Logic Foundry tools. Reads are always allowed. Writes (save, delete, release, test, and run
// of a logic flow, which commits) are allowed only when the repository uses the workflow's change folders and:
// the active change is in the build stage (review for fix tasks; acceptance for test runs), the plan is approved
// (the spec, for a quick change), no approved file (spec or plan) has changed since, and a delete is listed in one.
// A repository without logic-fabric/workspace.yaml hasn't adopted the workflow, and nothing is refused.
import { readFileSync } from 'node:fs';
import { OFFERING, buildRefusal, findWorkspace, isOwnWorkspace, readInput, workspaceOffering } from './workspace.mjs';

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

if (!isOwnWorkspace(workspace)) {
  deny(`This repository's Logic Fabric workspace is for the ${workspaceOffering(workspace)} offering (offering in logic-fabric/workspace.yaml). The Logic Fabric for Dataverse plugin changes Logic Foundry only from a workspace for ${OFFERING}.`);
}

const { refusal, change, approved } = buildRefusal(workspace, `Foundry ${tool}`, tool === 'test' ? ['build', 'review', 'acceptance'] : ['build', 'review']);

if (refusal) {
  deny(refusal);
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
