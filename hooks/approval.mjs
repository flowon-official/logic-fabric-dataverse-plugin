// PostToolUse on file writes: when the agent records an approval in a change's status.yaml (<gate>_approved_by set
// and <gate>_sha256 empty), stamp the hash of the approved file, so approving needs no shell. To approve again after
// an amendment, record the new approval with <gate>_sha256 left empty.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { addContext, fileWrites } from './client.mjs';
import { changeStatusFile, readInput, readStatus, sha256 } from './workspace.mjs';

const GATES = ['spec', 'plan'];

const input = await readInput();
const stamped = [];

for (const write of fileWrites(input)) {
  const file = changeStatusFile(input.cwd, write.path);

  if (!file || !existsSync(file)) {
    continue;
  }

  const folder = dirname(file);
  const status = readStatus(folder);
  let text = readFileSync(file, 'utf8');
  const before = stamped.length;

  for (const gate of GATES) {
    const key = `${gate}_sha256`;

    if (!status[`${gate}_approved_by`] || status[key]) {
      continue;
    }

    const hash = sha256(join(folder, `${gate}.md`));

    if (!hash) {
      continue;
    }

    // "." stops before \r, so a CRLF file keeps its line endings.
    const line = new RegExp(`^${key}:.*$`, 'm');
    text = line.test(text) ? text.replace(line, `${key}: ${hash}`) : `${text.replace(/\s*$/, '')}\n${key}: ${hash}\n`;
    stamped.push(`${key} (${gate}.md as approved)`);
  }

  if (stamped.length > before) {
    writeFileSync(file, text);
  }
}

if (stamped.length > 0) {
  addContext('PostToolUse', `The plugin recorded ${stamped.join(' and ')} in status.yaml. Read status.yaml again before editing it.`);
}

process.exit(0);
