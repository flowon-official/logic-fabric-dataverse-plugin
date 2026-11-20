---
type: regex
target: trace
pattern: '\\"passed\\":[1-9][0-9]*,\\"failed\\":0,\\"errored\\":0,\\"skipped\\":0'
match: contains
weight: 1
---

Passes when a Foundry test run passed every case with none skipped (the first change).
