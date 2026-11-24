// PreToolUse gate for Logic Foundry tools. Reads are always allowed. Writes (save, delete, release, test, and run
// of a logic flow, which commits) are allowed only when the repository uses the workflow's change folders and:
// the active change is in the build stage (review for fix tasks; acceptance for test runs), the plan is approved
// (the spec, for a quick change), no approved file (spec or plan) has changed since, and a delete is listed in one.
// release with action "approve" is no write: it asks Foundry to ask the owner, which is how a spec or plan (or an
// amended one) gets approved and a change accepted, so it passes in every stage. Nor is action "submit", which sends
// a built change to the owner for acceptance: it only stops Foundry's writes for the change.
// A repository without logic-fabric/workspace.yaml hasn't adopted the workflow, and nothing is refused.
import { readFileSync } from 'node:fs';
import { decide, isFoundryTool, toolName } from './client.mjs';
import { OFFERING, buildRefusal, findWorkspace, isOwnWorkspace, readCreated, readInput, workspaceOffering } from './workspace.mjs';

const WRITES = new Set(['save', 'delete', 'release', 'test']);

const deny = reason => decide('PreToolUse', 'deny', reason);

const input = await readInput();
const tool = toolName(input);
const args = input.tool_input || {};
const isApproval = tool === 'release' && ['approve', 'submit'].includes(String(args.action || '').toLowerCase());
const isWrite = isFoundryTool(input) && !isApproval && (WRITES.has(tool) || (tool === 'run' && String(args.kind || '').toLowerCase() === 'logicflow'));

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
  // An artifact this change created (export.mjs lists them) may be deleted again without a plan line: a probe, or
  // something built by mistake, that never existed before the change.
  const kind = String(args.kind || '').toLowerCase();
  const ownCreation = readCreated(change.folder).some(e => String(e.kind).toLowerCase() === kind
    && ((args.id && String(e.id).toLowerCase() === String(args.id).toLowerCase()) || (args.name && e.name === args.name)));

  if (ownCreation) {
    process.exit(0);
  }

  // Otherwise listed when a line of an approved file names the target with "delete" (or deleted, deletes, deleting,
  // deletion). The plan names artifacts, so a delete by ID alone can't be matched: ask for the name.
  if (!args.name && args.id) {
    deny(`Delete by name (project and name), not by ID: the approved plan names what may be deleted, as "Delete <kind> <name>: <reason>", and an ID can't be checked against it. An artifact this change created itself can be deleted by name or ID without a plan line.`);
  }

  const target = String(args.name || '').trim();
  const listed = target && approved.some(({ file }) =>
    readFileSync(file, 'utf8').split(/\r?\n/).some(line => /\bdelet(e|ed|es|ing|ion)\b/i.test(line) && line.includes(target)));

  if (!listed) {
    deny(`Deleting '${target}' isn't in an approved file of ${change.name}. Add a line "Delete <kind> ${target}: <reason>" to the plan's summary (plan.md, or spec.md for a quick change without a plan) and get it approved. (An artifact this change created itself, as listed in artifacts/created.json, needs no plan line.)`);
  }
}

process.exit(0);
