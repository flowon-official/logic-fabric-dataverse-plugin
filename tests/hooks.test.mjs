// The workflow's hooks (hooks/) on each client: Claude Code's payloads and answers, and
// the ones Codex and GitHub Copilot send and expect (client.mjs). Run: node --test tests/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const hooks = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks');
const { parsePatch, fileWrites, normalize } = await import(new URL(`file:///${join(hooks, 'client.mjs').replace(/\\/g, '/')}`).href);
const roots = [];

after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));

const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n').replace(/^(\s*[-*+] )\[[xX]\]/gm, '$1[ ]')).digest('hex');

const spec = '# Spec\nKind: logic block `Financials_X`, deleted.\n';
const plan = '# Plan\n## Summary for approval\n- Delete logicBlock Financials_Y: replaced\n';

// A workspace with one active change, its files and its status.yaml.
function workspace(name, files, status) {
  const root = mkdtempSync(join(tmpdir(), 'lf-hooks-'));
  roots.push(root);
  const change = join(root, 'logic-fabric', 'changes', name);
  mkdirSync(join(change, 'tests'), { recursive: true });
  writeFileSync(join(root, 'logic-fabric', 'workspace.yaml'), 'offering: dataverse\nenvironment: dev\n');
  writeFileSync(join(root, 'logic-fabric', '.active'), name + '\n');
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(change, file), text);
  }
  const lines = Object.entries(status).map(([key, value]) => `${key}: ${typeof value === 'function' ? value(files) : value}`);
  writeFileSync(join(change, 'status.yaml'), lines.join('\n') + '\n');
  return { root, change, status: join(change, 'status.yaml') };
}

const built = () => workspace('built', { 'spec.md': spec, 'plan.md': plan }, {
  stage: 'build', quick: 'false', spec_sha256: f => hash(f['spec.md']), plan_sha256: f => hash(f['plan.md']),
});

// Runs a hook as the given client with the payload, and returns its decision ('allow' when it wrote none), reason,
// and the raw answer.
function run(script, payload, client) {
  const args = [join(hooks, script), ...(client ? ['--client', client] : [])];
  const out = execFileSync('node', args, { input: JSON.stringify(payload) }).toString();
  const answer = out.trim() ? JSON.parse(out) : {};
  const decision = answer.hookSpecificOutput?.permissionDecision ?? answer.permissionDecision ?? 'allow';
  const reason = answer.hookSpecificOutput?.permissionDecisionReason ?? answer.permissionDecisionReason ?? '';
  return { decision, reason, answer };
}

describe('the gate on Claude Code', () => {
  const claude = (ws, tool, args) => run('gate.mjs', { cwd: ws.root, tool_name: `mcp__plugin_logic-fabric-dataverse_foundry__${tool}`, tool_input: args });

  test('a save in the build stage of an approved plan passes, a listed delete too', () => {
    const ws = built();
    assert.equal(claude(ws, 'save', {}).decision, 'allow');
    assert.equal(claude(ws, 'delete', { kind: 'logicBlock', name: 'Financials_Y' }).decision, 'allow');
    assert.equal(claude(ws, 'delete', { kind: 'logicBlock', name: 'Financials_Z' }).decision, 'deny');
  });

  test('a plan edited after its approval stops writes', () => {
    const ws = built();
    writeFileSync(join(ws.change, 'plan.md'), plan + '- Delete logicBlock Financials_Z: sneaked in\n');
    assert.equal(claude(ws, 'save', {}).decision, 'deny');
  });

  test('approving, submitting for acceptance, the owner deciding and blocked tasks are no writes', () => {
    const acceptance = '# Acceptance\n- AC-1.1 passed\n';
    const ws = workspace('review', { 'spec.md': spec, 'plan.md': plan, 'acceptance.md': acceptance }, {
      stage: 'acceptance', quick: 'false', spec_sha256: f => hash(f['spec.md']), plan_sha256: f => hash(f['plan.md']),
    });
    assert.equal(claude(ws, 'release', { action: 'approve', changeId: 'review', options: { gate: 'acceptance', text: acceptance } }).decision, 'allow');
    assert.equal(claude(ws, 'release', { action: 'submit', changeId: 'review' }).decision, 'allow');
    assert.equal(claude(ws, 'release', { action: 'block', changeId: 'review', options: { task: 'T-07' } }).decision, 'allow');
    assert.equal(claude(ws, 'release', { action: 'unblock', changeId: 'review', options: { task: 'T-07' } }).decision, 'allow');
    assert.equal(claude(ws, 'release', { action: 'publish', kind: 'businessProcess', name: 'P' }).decision, 'deny');
    assert.equal(claude(ws, 'test', {}).decision, 'allow');
  });

  test('an approval sends the change\'s file as saved, not a placeholder, a summary or part of it', () => {
    const planWithTasks = '# Plan\n## Summary for approval\n- Delete logicBlock Financials_Y: replaced\n\n- [ ] T-01 Save it\n- [ ] T-02 Test it\n';
    const ws = workspace('planning', { 'spec.md': spec, 'plan.md': planWithTasks }, { stage: 'plan', quick: 'false', spec_sha256: f => hash(f['spec.md']) });
    const approve = (gate, text, changeId = 'planning') => claude(ws, 'release', { action: 'approve', changeId, options: { gate, text } });

    // The file's text passes, also with CRLF line endings, ticked tasks or a Blocked: line, which the hash ignores.
    assert.equal(approve('plan', planWithTasks).decision, 'allow');
    assert.equal(approve('plan', planWithTasks.replace(/\n/g, '\r\n').replace('- [ ] T-01', '- [x] T-01').replace('- [ ] T-02 Test it\n', '- [ ] T-02 Test it\n  Blocked: a role is missing\n')).decision, 'allow');
    assert.equal(approve('spec', spec).decision, 'allow');

    const placeholder = approve('spec', '__SPEC__');
    assert.equal(placeholder.decision, 'deny');
    assert.match(placeholder.reason, /isn't planning\/spec\.md as saved \(it differs from line 1/);

    const partial = approve('plan', planWithTasks.split('\n').slice(0, 3).join('\n') + '\n');
    assert.equal(partial.decision, 'deny');
    assert.match(partial.reason, /differs from line 5: 4 lines sent, 7 in the file/);

    assert.match(approve('plan', undefined).reason, /no text was sent/);
    assert.match(approve('acceptance', '# Acceptance').reason, /acceptance\.md doesn't exist yet/);
    assert.match(approve('plan', planWithTasks, 'another-change').reason, /no change folder logic-fabric\/changes\/another-change\//);

    // Without a changeId, the active change's file; a waiver's text isn't a file of the change.
    assert.equal(claude(ws, 'release', { action: 'approve', options: { gate: 'plan', text: planWithTasks } }).decision, 'allow');
    assert.equal(approve('exception', '{"rule":"LF-011"}').decision, 'allow');
  });

  test('outside a workspace, an approval isn\'t checked', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf-hooks-'));
    roots.push(root);
    assert.equal(run('gate.mjs', { cwd: root, tool_name: 'mcp__plugin_logic-fabric-dataverse_foundry__release', tool_input: { action: 'approve', options: { gate: 'spec', text: '__SPEC__' } } }).decision, 'allow');
  });

  test('the answer is Claude Code\'s hookSpecificOutput', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'plan', quick: 'false' });
    const { answer } = claude(ws, 'save', {});
    assert.equal(answer.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(answer.hookSpecificOutput.permissionDecision, 'deny');
  });
});

describe('the hooks on GitHub Copilot', () => {
  test('Foundry\'s tools are <server>-<tool> (as Copilot CLI names them), and the answer is top level', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'plan', quick: 'false' });
    const { answer } = run('gate.mjs', { cwd: ws.root, hook_event_name: 'PreToolUse', tool_name: 'foundry-delete', tool_input: { kind: 'logicFlow', project: 'P', name: 'X' } }, 'copilot');
    assert.equal(answer.permissionDecision, 'deny');
    assert.match(answer.permissionDecisionReason, /Foundry delete is allowed only in build or review/);
    assert.equal(run('gate.mjs', { cwd: ws.root, tool_name: 'foundry-find', tool_input: { kinds: ['project'] } }, 'copilot').decision, 'allow');
  });

  test('a camelCase payload (toolArgs as a JSON string) is read, and the answer is top level', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'plan', quick: 'false' });
    const { decision, answer } = run('gate.mjs', { cwd: ws.root, toolName: 'foundry/save', toolArgs: JSON.stringify({ kind: 'logicFlow' }) }, 'copilot');
    assert.equal(decision, 'deny');
    assert.equal(answer.permissionDecision, 'deny');
    assert.match(answer.permissionDecisionReason, /plan/);
    assert.equal(answer.hookSpecificOutput, undefined);
  });

  test('a tool of another server is not Foundry\'s, whatever its name', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'plan', quick: 'false' });
    assert.equal(run('gate.mjs', { cwd: ws.root, tool_name: 'notes/save', tool_input: {} }, 'copilot').decision, 'allow');
    assert.equal(run('gate.mjs', { cwd: ws.root, tool_name: 'notes-save', tool_input: {} }, 'copilot').decision, 'allow');
  });

  test('an edit of status.yaml with path, old_str and new_str is checked', () => {
    const ws = built();
    const edit = { cwd: ws.root, tool_name: 'Edit', tool_input: { path: ws.status, old_str: 'stage: build', new_str: 'stage: plan' } };
    assert.equal(run('stage.mjs', edit, 'copilot').decision, 'deny');
    const forward = { ...edit, tool_input: { ...edit.tool_input, new_str: 'stage: review' } };
    assert.equal(run('stage.mjs', forward, 'copilot').decision, 'allow');
  });

  test('the export reads a save\'s result from text_result_for_llm', () => {
    const ws = built();
    const result = { kind: 'logicFlow', name: 'Origination_Check', created: true, id: '6cc11d7d-e5e6-f111-84e9-70a8a5b02d61', source: { kind: 'logicFlow', name: 'Origination_Check' } };
    run('export.mjs', { cwd: ws.root, hook_event_name: 'PostToolUse', tool_name: 'foundry-save', tool_input: {}, tool_result: { result_type: 'success', text_result_for_llm: JSON.stringify(result) } }, 'copilot');
    assert.deepEqual(JSON.parse(readFileSync(join(ws.change, 'artifacts', 'logicFlow', 'Origination_Check.json'), 'utf8')), result.source);
  });
});

describe('the hooks on Codex', () => {
  test('Foundry\'s tools are mcp__foundry__<tool>, and the answer is hookSpecificOutput', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'plan', quick: 'false' });
    const { answer } = run('gate.mjs', { cwd: ws.root, hook_event_name: 'PreToolUse', tool_name: 'mcp__foundry__save', tool_input: {} }, 'codex');
    assert.equal(answer.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('an apply_patch that moves a stage back is refused, one that moves it forward passes', () => {
    const ws = built();
    const patch = to => `*** Begin Patch\n*** Update File: ${ws.status}\n@@\n-stage: build\n+stage: ${to}\n quick: false\n*** End Patch\n`;
    assert.equal(run('stage.mjs', { cwd: ws.root, tool_name: 'apply_patch', tool_input: { command: patch('plan') } }, 'codex').decision, 'deny');
    assert.equal(run('stage.mjs', { cwd: ws.root, tool_name: 'apply_patch', tool_input: { command: patch('review') } }, 'codex').decision, 'allow');
  });

  test('an apply_patch that writes an approval hash by hand is refused', () => {
    const ws = workspace('planning', { 'spec.md': spec }, { stage: 'spec', quick: 'false', spec_approved_by: 'Owner' });
    const patch = `*** Begin Patch\n*** Update File: ${ws.status}\n@@\n spec_approved_by: Owner\n+spec_sha256: ${'a'.repeat(64)}\n*** End Patch\n`;
    assert.match(run('stage.mjs', { cwd: ws.root, tool_name: 'apply_patch', tool_input: { command: patch } }, 'codex').reason, /Don't write spec_sha256 yourself/);
  });

  test('a command that would ask the user is refused instead, telling the agent the user runs it', () => {
    const ws = built();
    const { decision, reason } = run('dataverse.mjs', { cwd: ws.root, tool_name: 'Bash', tool_input: { command: 'flowon-dynamics import --path ./artifacts' } }, 'codex');
    assert.equal(decision, 'deny');
    assert.match(reason, /can't ask the user from a hook/);
    assert.equal(run('dataverse.mjs', { cwd: ws.root, tool_name: 'Bash', tool_input: { command: 'flowon-dynamics import --path ./artifacts' } }).decision, 'ask');
  });
});

describe('apply_patch patches', () => {
  test('add, update (with a move) and delete', () => {
    const files = parsePatch('*** Begin Patch\n*** Add File: a.txt\n+one\n+two\n*** Update File: b.txt\n*** Move to: c.txt\n@@ head\n keep\n-old\n+new\n*** Delete File: d.txt\n*** End Patch\n');
    assert.deepEqual(files.map(f => [f.kind, f.path, f.moveTo]), [['add', 'a.txt', undefined], ['update', 'b.txt', 'c.txt'], ['delete', 'd.txt', undefined]]);
    assert.deepEqual(files[0].added, ['one', 'two']);
    assert.deepEqual(files[1].hunks, [{ old: ['keep', 'old'], new: ['keep', 'new'] }]);
  });

  test('the text after a patch, and null when its context isn\'t found', () => {
    const [write] = fileWrites(normalize({ tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: s.yaml\n@@\n a: 1\n-b: 2\n+b: 3\n*** End Patch' } }));
    assert.equal(write.after('a: 1\nb: 2\nc: 4\n'), 'a: 1\nb: 3\nc: 4\n');
    assert.equal(write.after('x: 9\n'), null);
  });
});
