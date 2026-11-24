// node --test tests/: the dashboard generator against a small workspace written to a temporary folder.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { isStale, writeDashboard } from '../scripts/dashboard.mjs';
import { sha256 } from '../hooks/workspace.mjs';

let root;
let workspace;
let change;

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

// The data the page carries, as the page reads it.
const dataOf = file => {
  const page = readFileSync(file, 'utf8');
  const start = page.indexOf('id="lf-data">') + 'id="lf-data">'.length;
  return JSON.parse(page.slice(start, page.indexOf('</script>', start)).replace(/<\\\//g, '</'));
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'lf-dashboard-'));
  workspace = join(root, 'logic-fabric');
  change = join(workspace, 'changes', '2026-11-20-claims-routing');
  write(join(workspace, 'workspace.yaml'), [
    'offering: dataverse', 'project: Claims', 'solution: Claims', 'prefix: fodemos',
    'environments:', '  development:', '    url: https://dev.example.crm.dynamics.com', '    role: development', '    tests_allowed: true', '',
  ].join('\n'));
  write(join(workspace, '.active'), '2026-11-20-claims-routing\n');
  write(join(change, 'spec.md'), [
    '# Spec: Route high-value claims', '', '## Requirements', '', '### REQ-1 Route by estimated loss',
    'Uses `Intake_RoutingRules`. A note with </script> in it stays text.', '',
    'AC-1.1 Given a loss of 50,001, then the claim goes to the senior adjusters.', 'Over two lines.', '',
    'AC-1.2 Given a loss of 50,000, then it stays in the general queue.', '',
  ].join('\n'));
  write(join(change, 'plan.md'), [
    '# Build plan: Route high-value claims', '', '## Tasks', '', '### Logic',
    '- [x] T-01 Create logic block `Intake_RoutingRules` (Decision table)          REQ-1',
    '      Tests: TC-1.1, TC-1.2.',
    '- [ ] T-02 Create logic flow `Claims_RouteClaim`                                REQ-1',
    '      Depends on: T-01.', '',
  ].join('\n'));
  write(join(change, 'tests', 'TC-1.1.yaml'), 'id: TC-1.1\ncovers: [AC-1.1]\nlevel: unit\ntarget: { kind: logicBlock, name: Intake_RoutingRules }\ngiven:\n  input: { EstimatedLoss: 50001 }\nexpect:\n  output:\n    QueueCode: SENIOR\n');
  write(join(change, 'tests', 'TC-1.2.yaml'), 'id: TC-1.2\ncovers:\n  - AC-1.2\nlevel: unit\ntarget:\n  kind: logicBlock\n  name: Intake_RoutingRules\nexpect:\n  error: { code: NOT_ROUTED }\n');
  write(join(change, 'artifacts', 'logicBlock', 'Intake_RoutingRules.json'), JSON.stringify({
    kind: 'logicBlock', name: 'Intake_RoutingRules', project: 'Claims', title: 'Intake · Routing Rules', logicBlockType: 2,
    metadata: { def: { input: { EstimatedLoss: { type: 'Money', list: false, required: true, metaInfo: { description: 'The loss.' } } } } },
  }, null, 2));
  write(join(change, 'artifacts', 'links.json'), JSON.stringify({ 'logicBlock:Intake_RoutingRules': 'https://dev.example.crm.dynamics.com/main.aspx?id=1' }));
  write(join(change, 'status.yaml'), [
    'change: 2026-11-20-claims-routing', 'stage: build', 'owner: owner@example.com', 'quick: false',
    'spec_approved_by: owner@example.com', 'spec_approved_at: 2026-11-20T10:00:00Z', `spec_sha256: ${sha256(join(change, 'spec.md'))}`,
    'plan_approved_by: owner@example.com', 'plan_approved_at: 2026-11-20T11:00:00Z', `plan_sha256: ${sha256(join(change, 'plan.md'))}`, '',
  ].join('\n'));
});

after(() => rmSync(root, { recursive: true, force: true }));

test('writes one card per change with its approvals, tasks, tests, requirements and artifacts', () => {
  const { file, changes } = writeDashboard(workspace);
  assert.equal(changes, 1);
  const data = dataOf(file);
  const c = data.changes[0];

  assert.equal(data.project, 'Claims');
  assert.equal(data.active, '2026-11-20-claims-routing');
  assert.equal(c.title, 'Route high-value claims');
  assert.equal(c.approvals.spec.state, 'valid');
  assert.equal(c.approvals.plan.state, 'valid');
  assert.deepEqual(c.tasks.map(t => [t.id, t.done, t.reqs]), [['T-01', true, ['REQ-1']], ['T-02', false, ['REQ-1']]]);
  assert.deepEqual(c.tests.map(t => [t.id, t.covers, t.target.name, t.expects]), [
    ['TC-1.1', ['AC-1.1'], 'Intake_RoutingRules', ['output']],
    ['TC-1.2', ['AC-1.2'], 'Intake_RoutingRules', ['error']],
  ]);
  const [req] = c.requirements;
  assert.equal(req.id, 'REQ-1');
  assert.deepEqual(req.criteria, ['AC-1.1', 'AC-1.2']);
  assert.equal(req.wording['AC-1.1'], 'Given a loss of 50,001, then the claim goes to the senior adjusters. Over two lines.');
  assert.deepEqual(req.tests, ['TC-1.1', 'TC-1.2']);
  assert.deepEqual(req.artifacts, ['Intake_RoutingRules']);
  const [block] = c.artifacts;
  assert.equal(block.url, 'https://dev.example.crm.dynamics.com/main.aspx?id=1');
  assert.deepEqual(block.facts[0], ['Type', 'Decision table']);
  assert.deepEqual(block.io.inputs[0], { name: 'EstimatedLoss', type: 'Currency', required: true, description: 'The loss.' });
  assert.match(c.docs.spec.html, /&lt;\/script&gt;/);
});

test('a Blocked: line marks the task blocked and keeps the plan approved', () => {
  const plan = join(change, 'plan.md');
  const original = readFileSync(plan, 'utf8');
  writeFileSync(plan, original.replace('      Depends on: T-01.', '      Blocked: validate refused the query (three attempts).\n      Depends on: T-01.'));
  try {
    const c = dataOf(writeDashboard(workspace).file).changes[0];
    const task = c.tasks.find(t => t.id === 'T-02');
    assert.equal(task.blocked, true);
    assert.equal(task.blockedReason, 'validate refused the query (three attempts).');
    assert.equal(c.approvals.plan.state, 'valid');
    assert.ok(c.attention.some(a => a.text === '1 task blocked'));
  } finally {
    writeFileSync(plan, original);
  }
});

test('an approved spec edited afterwards is reported', () => {
  const spec = join(change, 'spec.md');
  const original = readFileSync(spec, 'utf8');
  writeFileSync(spec, original.replace('50,001', '60,001'));
  try {
    const c = dataOf(writeDashboard(workspace).file).changes[0];
    assert.equal(c.approvals.spec.state, 'changed');
    assert.ok(c.attention.some(a => a.text === 'Spec changed since it was approved'));
  } finally {
    writeFileSync(spec, original);
  }
});

test('the dashboard is ignored by git once, and is stale only after the workspace changes', () => {
  const { file } = writeDashboard(workspace);
  writeDashboard(workspace);
  const ignored = readFileSync(join(workspace, '.gitignore'), 'utf8').split('\n').filter(l => l.trim() === 'dashboard.html');
  assert.equal(ignored.length, 1);

  const written = new Date(Date.now() - 60_000);
  utimesSync(file, written, written);
  const earlier = new Date(Date.now() - 120_000);
  utimesSync(join(change, 'plan.md'), earlier, earlier);
  for (const name of ['spec.md', 'status.yaml', 'tests/TC-1.1.yaml', 'tests/TC-1.2.yaml', 'artifacts/links.json', 'artifacts/logicBlock/Intake_RoutingRules.json']) {
    utimesSync(join(change, name), earlier, earlier);
  }
  for (const name of ['workspace.yaml', '.active']) utimesSync(join(workspace, name), earlier, earlier);
  assert.equal(isStale(workspace), false);

  utimesSync(join(change, 'plan.md'), new Date(), new Date());
  assert.equal(isStale(workspace), true);
});
