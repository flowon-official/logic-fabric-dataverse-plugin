// node --test tests/: process diagrams in BPMN notation, from the outline the documenter writes in a ```bpmn block.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutlineError, drawProcess, layout, parseOutline, toBpmnXml, toSvg } from '../scripts/bpmn.mjs';
import { CREDIT } from './credit-outline.mjs';

// Every element closed, in order.
function assertWellFormed(name, xml) {
  const open = [];
  for (const [tag] of xml.matchAll(/<[^>]+>/g)) {
    if (tag.startsWith('<?') || tag.endsWith('/>')) continue;
    const element = /^<\/?([\w:.-]+)/.exec(tag)[1];
    if (tag.startsWith('</')) assert.equal(open.pop(), element, `${name}: </${element}>`);
    else open.push(element);
  }
  assert.deepEqual(open, [], `${name}: unclosed elements`);
}

test('the outline is read as lanes, elements, flows and timers', () => {
  const model = parseOutline(CREDIT);
  assert.equal(model.title, 'Credit approval');
  assert.deepEqual(model.lanes.map(l => l.id), ['tier', 'committee']);
  assert.equal(model.nodes.length, 9);
  assert.equal(model.nodes.find(n => n.id === 'second').lane, 'committee');
  assert.deepEqual(model.timers, [{ from: 'decision', to: 'overdue', label: 'Due date passed', line: 6 }]);
  assert.equal(model.flows.find(f => f.to === 'returned').isDefault, true);
  assert.equal(model.flows.find(f => f.to === 'second').label, 'First committee approval');
  assert.equal(parseOutline('start a\nend b\na -> b').nodes[0].lane, '', 'no lanes: one unnamed lane');
});

test('a mistake in the outline names its line', () => {
  assert.throws(() => parseOutline('start a\na -> b'), e => e instanceof OutlineError && /line 2: "b" isn't declared/.test(e.message));
  assert.throws(() => parseOutline('start a\nstart a'), /line 2: "a" is declared twice/);
  assert.throws(() => parseOutline('start a\nthis is prose'), /line 2: can't read "this is prose"/);
  assert.throws(() => parseOutline('start a\nend b\ntimer a -> b'), /line 3: a timer goes on a task/);
  assert.throws(() => parseOutline('lane x: X\nstart a in y'), /line 2: the lane "y" isn't declared/);
  assert.throws(() => parseOutline('# nothing'), /it has no elements/);
});

test('the layout runs left to right: a timer\'s next step under its task, a gateway\'s branches around it', () => {
  const { nodes, width, height } = layout(parseOutline(CREDIT));
  const at = id => nodes.find(n => n.id === id);
  assert.ok(at('ready').cx < at('decision').cx && at('decision').cx < at('outcome').cx && at('outcome').cx < at('approved').cx);
  assert.equal(at('overdue').rank, at('decision').rank, 'the overdue task is in its task\'s column');
  assert.ok(at('overdue').cy > at('decision').cy, 'and under it');
  assert.equal(at('outcome').cy, at('decision').cy, 'the gateway is in line with the task before it');
  const ends = ['approved', 'declined', 'returned'].map(at).map(n => n.cy).sort((a, b) => a - b);
  assert.ok(ends[0] < at('outcome').cy && ends[2] > at('outcome').cy, 'the branches fan out above and below');
  assert.ok(at('second').cy > Math.max(...nodes.filter(n => n.lane === 'tier').map(n => n.cy)), 'the committee lane is below');

  for (const a of nodes) {
    assert.ok(a.cx - a.w / 2 >= 0 && a.cx + a.w / 2 <= width && a.cy - a.h / 2 >= 0 && a.cy + a.h / 2 <= height, `${a.id} is inside`);
    for (const b of nodes) {
      if (a === b) continue;
      const apart = Math.abs(a.cx - b.cx) >= (a.w + b.w) / 2 || Math.abs(a.cy - b.cy) >= (a.h + b.h) / 2;
      assert.ok(apart, `${a.id} and ${b.id} don't overlap`);
    }
  }
});

test('the drawing is SVG with the pool, the lanes, the shapes and the labels, escaped', () => {
  const svg = toSvg(layout(parseOutline(CREDIT)));
  assertWellFormed('svg', svg);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+" viewBox=/);
  assert.match(svg, /rotate\(-90\)[^>]*>Credit approval<\/text>/);
  assert.match(svg, />Lending Credit Committee<\/text>/);
  assert.match(svg, /Declined &amp; closed/);
  assert.match(svg, /&lt;to underwriting&gt;/);
  assert.doesNotMatch(svg, /<script|<style|<foreignObject|href=/, 'only shapes and text, for Word\'s SVG reader');
});

test('the BPMN file has the process, its lanes, a timer on the task, the default flow and the layout', () => {
  const xml = toBpmnXml(layout(parseOutline(CREDIT)));
  assertWellFormed('bpmn', xml);
  const ids = new Set([...xml.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  for (const [, source, target] of xml.matchAll(/sourceRef="([^"]+)" targetRef="([^"]+)"/g)) {
    assert.ok(ids.has(source) && ids.has(target), `${source} -> ${target}`);
  }
  assert.equal(xml.match(/<bpmn:userTask /g).length, 3);
  assert.equal(xml.match(/<bpmn:endEvent /g).length, 4);
  assert.equal(xml.match(/<bpmn:lane /g).length, 2);
  assert.match(xml, /<bpmn:boundaryEvent id="Timer_1" name="Due date passed" attachedToRef="Node_decision" cancelActivity="true">.*<bpmn:timerEventDefinition/);
  const fallback = /<bpmn:exclusiveGateway id="Node_outcome" name="Outcome\?" default="([^"]+)"/.exec(xml);
  assert.ok(fallback, 'the gateway names its default flow');
  assert.match(xml, new RegExp(`<bpmn:sequenceFlow id="${fallback[1]}" sourceRef="Node_outcome" targetRef="Node_returned"/>`));
  const flowNodes = xml.match(/<bpmn:(startEvent|userTask|exclusiveGateway|endEvent|boundaryEvent) id="/g).length;
  assert.equal(xml.match(/<bpmndi:BPMNShape /g).length, flowNodes + 1 + 2, 'a shape for each element, the pool and the lanes');
  assert.equal(xml.match(/<bpmndi:BPMNEdge /g).length, xml.match(/<bpmn:sequenceFlow /g).length);
});

test('drawProcess gives the SVG, the BPMN file and the size', () => {
  const d = drawProcess(CREDIT);
  assert.equal(d.title, 'Credit approval');
  assert.ok(d.width > 400 && d.height > 200);
  assert.ok(d.svg.startsWith('<svg') && d.bpmn.startsWith('<?xml'));
});
