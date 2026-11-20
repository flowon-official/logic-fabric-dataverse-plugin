---
type: regex
target: trace
pattern: '\\"passed\\":[1-9][0-9]*,\\"failed\\":0,\\"errored\\":0,\\"skipped\\":[1-9][0-9]*'
match: contains
weight: 1
---

Passes when a test run passed with retired regression cases skipped (the removal change).
