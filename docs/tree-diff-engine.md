# Tree Diff Engine — How it works

This document explains the diff algorithm implemented in `components/tree-diff-engine.js`.

## Overview

The engine compares two DXF-like trees by:
- Creating stable keys (semantic IDs) for each node/property
- Flattening trees into linear row sequences
- Aligning sequences (LCS or a scalable patience-style approach)
- Computing row- and cell-level differences with lightweight caching

Outputs include aligned row pairs and maps of row/cell CSS classes for “added/removed/changed” visualization.

## 1) Semantic IDs: stable identity across files

A semantic ID is built per node to keep references stable across files and reordering:
- If a node has a handle and `ignoreHandles` is false → `H:<handle>`
- Else → `TYPE|name`, where TYPE is `node.type.toUpperCase()` and name is:
  - For SECTION/BLOCK/TABLE or children of TABLE: property code 2 value
  - For CLASS: `CLASSID:<classId>`
- If no name and handles are ignored:
  - If `includePropertyCodesInId` is true, use a sorted code signature: `TYPE|C:<code1,code2,...>`
  - Else use bare `TYPE`
- When ignoring handles, siblings with identical base IDs are disambiguated by an occurrence index: `<baseId>#<n>`

This keeps IDs stable while avoiding collisions among similar siblings.

## 2) Flattening the tree to linear rows

Each node and each property becomes a row:
- Node row
  - key: `N|<path>` where `<path>` joins the ancestor IDs with `/`
  - value: `level|type|code:value;code:value;...` (properties sorted numerically by code)
  - metadata: the original `node` and its `level`
- Property row
  - key: `P|<path>|<code>#<occurrence>` (occurrence distinguishes duplicate codes)
  - value: `P|<code>|<value>`

Flattening makes the hierarchical diff a standard sequence alignment problem.

## 3) Alignment algorithms

Two strategies are used depending on input size:

- LCS (classic dynamic programming) for moderate inputs
  - Exact longest common subsequence on row keys
  - Complexity ~ O(N×M) time/space; gated by a threshold of 2,000,000 DP cells

- Smart alignment (patience-style with LCS fallbacks) for large inputs
  - Build frequency maps; take keys that are unique on each side as anchors
  - Sort anchors by left index and compute LIS over their right indices to preserve order
  - Recursively align segments around anchors:
    - Use LCS on segments under the threshold
    - Otherwise, fall back to a greedy split that marks whole segments as unmatched

This yields good matches via unique anchors while keeping memory bounded.

## 4) Splitting row values into cells (with caching)

Each row is rendered into cells for fine-grained diffs:
- line: `node.line || ''`
- code: for properties/end markers → the group code; for non-leaf nodes with children/properties → `'0'`; otherwise `''`
- type: human-readable label
  - CLASS → `CLASS (name) (ID=…)` (name from property code 1)
  - Named containers → `TYPE (name)` (name from property code 2)
  - Otherwise → `node.type`
- objectCount: count of descendant non-property nodes
- dataSize: cumulative character size of `type` + property values + all descendants

A cached variant stores per-node `objectCount` and `dataSize` to avoid recomputation across many comparisons.

## 5) Computing the diff

Steps:
1. Flatten both trees and collect the key sequences
2. Align keys using LCS or the smart approach
3. For each aligned pair:
   - Both sides present:
     - If row `value` strings differ → mark both as `diff-changed`
     - Split into cells; differing fields get `cell-changed`
   - Only left present → mark `diff-removed` and all cells `cell-removed`
   - Only right present → mark `diff-added` and all cells `cell-added`

Returns:
- `aligned`: array of `{ leftIndex, rightIndex }` into the flattened arrays
- `totalRows`: length of `aligned`
- `leftRowClasses`, `rightRowClasses`: Map(index → `'diff-*'`)
- `leftCellClasses`, `rightCellClasses`: Map(index → { cellName → `'cell-*'` })

## 6) Options

- `ignoreHandles`: ignore node handles for identity; use type/name/codes + sibling indices instead
- `includePropertyCodesInId`: when ignoring handles and a node has no name, include the sorted property code signature in IDs

## 7) Complexity and trade-offs

- LCS provides the most accurate alignment but has quadratic cost; the DP cell threshold prevents blowups
- Smart alignment scales better:
  - Anchor detection: O(N+M)
  - LIS over K anchors: O(K log K)
  - Segment recursion limits LCS to smaller chunks; otherwise greedy fallback keeps memory linear

## 8) Edge cases

- Duplicate properties: disambiguated using `#<occurrence>` in property keys
- Reordered siblings (with `ignoreHandles`): stabilized by per-sibling occurrence counters
- Unnamed generic nodes: optional property code signature reduces collisions among similar nodes
- Very large diffs: smart alignment avoids quadratic memory/time by using anchors + greedy fallback

---

For implementation details, see `components/tree-diff-engine.js`.
