# DXF Parser — How it works

This document explains the parsing and tree-building logic in `components/dxf-parser.js`.

## Overview

- Text input is parsed into DXF tags: `{ line, code, value }` pairs.
- Tags are grouped into a hierarchical tree of entities with properties and children.
- Known container entities have matching end markers; missing ends are closed synthetically.
- Handles and parent type metadata are attached to nodes.
- The tree can be serialized back into a DXF-like text format.

## 1) Parsing tags

### `parse(text)`
- Entry point: `parseDxf(text)` → `groupObjectsIterative(tags, 0)` → returns `objects` (root array).

### `parseDxf(text)`
- Splits on CR/LF, iterating in steps of two lines (code line, value line).
- Code line:
  - `.trim()`; must parse as integer; invalid/empty lines are skipped.
- Value line:
  - Preserved as-is (no trim) to retain whitespace; can be empty and still valid.
- The recorded `line` is the index of the value line, aligning with UI/file numbering.
- Output: array of tags `{ line, code, value }`.

### `parseDxfLines(lines)`
- Alternate helper when you already have an array of lines.
- Similar to `parseDxf` but trims the value line; use when you prefer normalized values.

Why line handling matters: using the value line index preserves positions for diagnostics and for placing synthetic end markers just after the last meaningful content.

## 2) Grouping into a node tree

Two implementations exist; the iterative one is used by `parse`.

### Containers and end markers
- `containerMapping` maps start → end markers:
  - `SECTION → ENDSEC`, `BLOCK → ENDBLK`, `TABLE → ENDTAB`, `OBJECT → ENDOBJ`, `POLYLINE → SEQEND`.
- Any entity whose `type.toUpperCase()` is in this map is treated as a container.

### `groupObjectsIterative(tags, startIndex = 0, endMarker = null, containerStartLine = null)`
- Maintains a stack of contexts:
  - `{ children, expectedEndMarker, lastNonEmptyLine, containerNode, parentType }`
- Walks the tag stream and applies rules:
  1) For `code !== 0`: these are properties of the current in-progress entity; they’re accumulated accordingly and update `lastNonEmptyLine` if the value is non-empty.
  2) For `code === 0`: starts a new entity or closes the current container if it matches the expected end marker.
  3) `EOF` is recognized as a standalone node (`isEOF: true`).
- Starting an entity:
  - Create `{ id, type, line, code, properties: [], children: [], expanded: false, isContainer, parentType }`.
  - Collect following `code !== 0` tags as its properties.
  - If it has a handle property (via `isHandleCode`), set `entity.handle`.
  - If `isContainer === true`, push current context and switch to a new context for its children. Otherwise, append to `current.children`.
- Closing a container (encountering its `expectedEndMarker`):
  - Emit an `endNode` with `isEndMarker: true` and attach any subsequent `code !== 0` tags to it as properties.
  - Pop back to the parent context.
  - Consume any extra `code !== 0` tags immediately after the end marker and append them to the finished container’s `properties` (so trailing attributes are not lost).

### Recursive variant: `groupObjects(...)`
- Mirrors the same logic but uses recursion instead of an explicit stack; kept for reference.

### Synthetic end markers
- If the stream ends while a container is open:
  - Create a synthetic end node with:
    - `type = expectedEndMarker`
    - `line = lastNonEmptyLine + 1`
    - `code = 0`, `isEndMarker: true`, `synthetic: true`
- This guarantees a well-formed tree even for truncated or malformed inputs.

## 3) Handles and parent type

- Handle detection: the first property whose code satisfies `isHandleCode(code)` sets `entity.handle`.
  - Note: `isHandleCode` is assumed elsewhere (e.g., utility) and checks DXF handle group codes.
- `parentType`: each node records the type of its containing node; useful downstream (e.g., diffing TABLE records or UI labeling).

## 4) Serialization back to DXF

### `serializeNode(node)`
- Emits:
  - `0`, then `node.type`
  - All properties as `code` then `value` lines (in stored order)
  - For containers, recursively serializes children.
  - Adds a closing end marker (`containerMapping[type]`) only if the last child isn’t already an end marker, avoiding double-closing.

### `serializeTree(nodes)`
- Serializes each top-level node and joins with newlines.

Note: serialization preserves property order and child ordering as stored in the tree.

## 5) Utilities

- `findNodeById` / `findNodeByIdIterative`: depth-first search to locate a node by `id`.
- `findParentByIdIterative`: returns the parent node for a given `id`.

## 6) Complexity and edge cases

- Complexity
  - Parsing: O(L) in input lines
  - Grouping: O(T) in tags; iterative method avoids deep recursion and stack overflows
  - Memory: O(T) for tags and node tree
- Edge cases handled
  - Empty/invalid code lines are skipped safely.
  - Value lines can be empty and are preserved (in `parseDxf`).
  - Extra properties after a closing end marker are not dropped—they’re attached back to the finished container.
  - Missing end markers produce synthetic end nodes, keeping the structure valid.
  - `EOF` markers are recognized and included explicitly.
