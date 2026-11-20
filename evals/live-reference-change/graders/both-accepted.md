---
type: regex
target: trace
pattern: '"name":"(?:Write|Edit)","input":\{[^\n]*?"file_path":"[^"]*[^"]*"[^\n]*?"(?:content|new_string)":"(?:[^"\\]|\\.)*stage: accepted[\s\S]*"name":"(?:Write|Edit)","input":\{[^\n]*?"file_path":"[^"]*[^"]*"[^\n]*?"(?:content|new_string)":"(?:[^"\\]|\\.)*stage: accepted'
match: contains
weight: 1
---

Passes when two changes were set to stage accepted (adding the block, then removing it).
