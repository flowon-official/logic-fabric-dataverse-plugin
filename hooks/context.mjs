// UserPromptSubmit (and SessionStart, for a client that drops a prompt hook's context): in a repository that uses the
// workflow, tell the agent the active change, its stage and whether the approved spec and plan still match their
// approval hashes, so no command needs a shell to check them.
import { join } from 'node:path';
import { addContext } from './client.mjs';
import { OFFERING, activeChange, findWorkspace, isOwnWorkspace, readInput, readStatus, sha256, workspaceOffering } from './workspace.mjs';

const input = await readInput();
const workspace = findWorkspace(input.cwd);

if (!workspace) {
  process.exit(0);
}

const change = isOwnWorkspace(workspace) ? activeChange(workspace) : null;
let context;

if (!isOwnWorkspace(workspace)) {
  context = `The Logic Fabric workspace here is for the ${workspaceOffering(workspace)} offering, not ${OFFERING}: the Logic Fabric for Dataverse plugin's workflow doesn't apply in this repository.`;
} else if (!change) {
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

addContext(input.hook_event_name === 'SessionStart' ? 'SessionStart' : 'UserPromptSubmit', context);
process.exit(0);
