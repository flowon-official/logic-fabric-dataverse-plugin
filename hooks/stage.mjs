// PreToolUse on file writes (Write, Edit, MultiEdit, apply_patch) of a change's status.yaml: keeps the workflow's
// state honest, since the gate trusts it.
// - A new change starts at prompt.
// - An accepted change is closed: its stage no longer changes. Further work, undoing it included, is a new change.
// - Stages move forward. Going back is allowed only among the stages before build (nothing is written to
//   Foundry there), or from acceptance to spec or build when the owner rejects, with rejected_by and
//   rejected_reason recorded.
// - <gate>_sha256 is stamped by the approval hook: it may be emptied for a new approval, never set by hand.
// And on a change's own test files (logic-fabric/changes/<change>/tests/): a change can't retire its own tests.
// Only a later change retires the regression copies in logic-fabric/baseline/tests/.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { command, decide, fileWrites } from './client.mjs';
import { STAGES, changeStatusFile, isOwnWorkspace, parseStatus, readInput } from './workspace.mjs';

const deny = reason => decide('PreToolUse', 'deny', reason);

const input = await readInput();

// A test file of a change in a workspace of this plugin's offering: logic-fabric/changes/<change>/tests/<file>.
function changeTestFile(cwd, path) {
  if (!path) {
    return null;
  }
  const file = resolve(cwd || process.cwd(), path);
  const tests = dirname(file);
  const changes = dirname(dirname(tests));
  return basename(tests) === 'tests' && basename(changes) === 'changes' && basename(dirname(changes)) === 'logic-fabric' && isOwnWorkspace(dirname(changes)) ? file : null;
}

const lf = text => String(text ?? '').replace(/\r\n/g, '\n');

function checkTests(before, after) {
  const retired = text => (text?.match(/\bretired["']?\s*:/g) || []).length;

  if (retired(after) > retired(before)) {
    deny(`Tests are retired only in their regression copies in logic-fabric/baseline/tests/, never in a change folder. A change can't retire its own tests: if a test fails, fix the artifact; if the test is wrong, amend the plan and get it approved again. A test of an earlier change that isn't accepted yet has no baseline copy: retire that copy once the earlier change is accepted (until then a regression run lists the test as replaced), and note it in the build log's open items.`);
  }
}

function checkStatus(before, after) {
  const old = before === null ? null : parseStatus(before);
  const now = parseStatus(after);
  const stage = now.stage || 'prompt';

  if (!STAGES.includes(stage)) {
    deny(`"${stage}" isn't a stage. The stages are ${STAGES.join(', ')}.`);
  }

  for (const gate of ['spec', 'plan']) {
    const key = `${gate}_sha256`;
    const was = (old?.[key] || '').toLowerCase();
    const is = (now[key] || '').toLowerCase();

    if (is && is !== was) {
      deny(`Don't write ${key} yourself: record ${gate}_approved_by and ${gate}_approved_at with ${key} empty, and the approval hook stamps the hash of the approved ${gate}.md.`);
    }
  }

  if (old === null) {
    if (stage !== 'prompt') {
      deny(`A new change starts at stage prompt (${command('start')}).`);
    }
    return;
  }

  const was = old.stage || 'prompt';

  if (stage === was) {
    return;
  }

  if (was === 'accepted' || old.accepted_by) {
    if (stage !== 'accepted') {
      deny(`The change is accepted, so it is closed and its stage can't change. Further work on what it built, undoing it included, is a new change (${command('start')}).`);
    }
    return;
  }

  const from = STAGES.indexOf(was);
  const to = STAGES.indexOf(stage);

  if (to < from) {
    const beforeBuild = from < STAGES.indexOf('build');
    // A rejection records who rejected and a reason not recorded before (an earlier rejection doesn't count again).
    const rejection = was === 'acceptance' && (stage === 'spec' || stage === 'build')
      && now.rejected_by && now.rejected_reason && now.rejected_reason !== old.rejected_reason;

    if (!beforeBuild && !rejection) {
      deny(`Stages move forward: ${was} can't go back to ${stage}. The only way back from acceptance is the owner rejecting it (${command('accept')} reject spec or reject build, with rejected_by and rejected_reason recorded). Work the approved plan doesn't cover is a plan amendment in the build stage, or a new change.`);
    }
  }
}

for (const write of fileWrites(input)) {
  const testFile = changeTestFile(input.cwd, write.path);
  const file = testFile || changeStatusFile(input.cwd, write.path);

  if (!file) {
    continue;
  }

  const before = existsSync(file) ? lf(readFileSync(file, 'utf8')) : null;
  const after = write.after(before);

  // An edit whose text isn't found fails on its own, and a deleted file has no stage: let them.
  if (after === null) {
    continue;
  }

  if (testFile) {
    checkTests(before, after);
  } else {
    checkStatus(before, after);
  }
}

process.exit(0);
