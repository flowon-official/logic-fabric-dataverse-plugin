// UserPromptSubmit: in a repository that uses the workflow, tell Claude the active change, its stage and whether
// the approved spec and plan still match their approval hashes, so no command needs a shell to check them.
import { join } from 'node:path';
import { activeChange, findWorkspace, readInput, readStatus, sha256 } from './workspace.mjs';

const input = await readInput();
const workspace = findWorkspace(input.cwd);

if (!workspace) {
  process.exit(0);
}

const change = activeChange(workspace);
let context;

if (!change) {
  context = 'Logic Fabric workspace: no active change.';
} else {
  const status = readStatus(change.folder);
  const parts = [`Active Logic Fabric change: ${change.name}, stage ${status.stage || 'prompt'}`];

  for (const gate of ['spec', 'plan']) {
    const approved = status[`${gate}_sha256`];

    if (approved) {
      const now = sha256(join(change.folder, `${gate}.md`));
      parts.push(now === null ? `${gate}.md is missing`
        : now === approved.toLowerCase() ? `${gate}.md matches its approval`
        : `${gate}.md has CHANGED since its approval`);
    } else if (status[`${gate}_approved_by`]) {
      parts.push(`${gate} approval recorded without a hash`);
    }
  }

  context = `${parts.join('; ')}.`;
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
}));
process.exit(0);
