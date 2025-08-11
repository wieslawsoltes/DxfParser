    class TreeDiffEngine {
      static sortProps(props) {
        return (props || []).slice().sort((a, b) => {
          const ac = Number(a.code) || 0;
          const bc = Number(b.code) || 0;
          return ac - bc;
        });
      }

      static getNodeSemanticId(node, options = {}) {
        if (!node || node.isProperty) return '';
        const ignoreHandles = !!options.ignoreHandles;
        const includePropertyCodesInId = !!options.includePropertyCodesInId;
        if (!ignoreHandles && node.handle) return `H:${node.handle}`;
        const type = node.type ? node.type.toUpperCase() : '';
        let name = '';
        // Named containers keep stable names across files
        if (type === 'SECTION' || type === 'BLOCK' || type === 'TABLE' || (node.parentType && node.parentType.toUpperCase() === 'TABLE')) {
          if (node.properties) {
            const p2 = node.properties.find(p => Number(p.code) === 2);
            if (p2) name = p2.value;
          }
        }
        if (type === 'CLASS' && node.classId !== undefined) {
          name = `CLASSID:${node.classId}`;
        }
        // For generic entities without a name
        if (!name && ignoreHandles) {
          if (includePropertyCodesInId) {
            const codes = (node.properties || []).map(p => Number(p.code) || 0).sort((a,b) => a-b);
            const codesKey = codes.length ? `C:${codes.join(',')}` : '';
            return `${type}|${codesKey}`;
          }
          // Lenient: use only type; sibling indexing in flatten keeps ordering distinct
          return `${type}`;
        }
        return `${type}|${name}`;
      }

      static stringifyNodeValue(node, level) {
        if (!node) return '';
        const type = node.type || '';
        const propsSorted = TreeDiffEngine.sortProps(node.properties);
        const props = propsSorted.map(p => `${p.code}:${p.value}`).join(';');
        return `${level}|${type}|${props}`;
      }

      static flattenTreeWithKeys(nodes, options = {}) {
        const rows = [];
        const traverse = (list, level, parentPath) => {
          // For each sibling list, keep counts to make IDs stable when ignoring handles
          const siblingCounts = new Map();
          for (const n of list || []) {
            let baseId = TreeDiffEngine.getNodeSemanticId(n, options);
            let id = baseId;
            if (options && options.ignoreHandles) {
              const count = (siblingCounts.get(baseId) || 0) + 1;
              siblingCounts.set(baseId, count);
              id = `${baseId}#${count}`;
            }
            const path = parentPath ? `${parentPath}/${id}` : id;
            rows.push({ key: `N|${path}`, value: TreeDiffEngine.stringifyNodeValue(n, level), node: n, level });
            if (n.properties && n.properties.length) {
              // Preserve original property order and disambiguate duplicates with an occurrence index
              const propCounts = new Map();
              for (const p of n.properties) {
                const codeStr = String(p.code);
                const occ = (propCounts.get(codeStr) || 0) + 1;
                propCounts.set(codeStr, occ);
                const pKey = `P|${path}|${codeStr}#${occ}`;
                rows.push({ key: pKey, value: `P|${codeStr}|${p.value ?? ''}`, node: { isProperty: true, code: p.code, data: p.value }, level: level + 1 });
              }
            }
            if (n.children && n.children.length) {
              traverse(n.children, level + 1, path);
            }
          }
        };
        traverse(nodes, 0, '');
        return rows;
      }

      static splitValueIntoCells(row) {
        const out = { line: '', code: '', type: '', objectCount: '', dataSize: '' };
        const node = row.node;
        if (!node) return out;
        out.line = node.line || '';
        if (node.isProperty || node.isEndMarker) {
          out.code = node.code != null ? String(node.code) : '';
        } else {
          out.code = ((node.properties && node.properties.length) || (node.children && node.children.length)) ? '0' : '';
        }
        if (node.isProperty) {
          out.type = (typeof node.data === 'string') ? node.data : (node.data ?? '');
        } else {
          if (node.type) {
            if (node.type.toUpperCase() === 'CLASS' && node.classId !== undefined) {
              let className = '';
              if (node.properties) {
                for (const prop of node.properties) {
                  if (Number(prop.code) === 1) { className = prop.value; break; }
                }
              }
              out.type = node.type + " (" + className + ") " + " (ID=" + node.classId + ")";
            } else if (node.type.toUpperCase() === 'SECTION' || node.type.toUpperCase() === 'BLOCK' || node.type.toUpperCase() === 'TABLE' || (node.parentType && node.parentType.toUpperCase() === 'TABLE')) {
              let nameValue = '';
              if (node.properties) {
                for (const prop of node.properties) {
                  if (Number(prop.code) === 2) { nameValue = prop.value; break; }
                }
              }
              out.type = nameValue ? node.type + " (" + nameValue + ")" : (node.type || '');
            } else {
              out.type = node.type || '';
            }
          }
        }
        if (!node.isProperty && node.children && node.children.length) {
          const countDesc = (n) => {
            if (!n.children || n.children.length === 0) return 0;
            let c = 0; for (let ch of n.children) { if (!ch.isProperty) { c++; if (ch.children && ch.children.length) c += countDesc(ch); } }
            return c;
          };
          out.objectCount = String(countDesc(node));
        } else out.objectCount = '';
        const size = (n) => {
          if (n.isProperty) return n.data ? n.data.length : 0;
          let s = n.type ? n.type.length : 0;
          if (n.properties && n.properties.length) { for (let p of n.properties) s += p.value ? p.value.length : 0; }
          if (n.children && n.children.length) { for (let ch of n.children) s += size(ch); }
          return s;
        };
        out.dataSize = String(size(node));
        return out;
      }

      static alignByKeysLCS(keysLeft, keysRight) {
        const n = keysLeft.length, m = keysRight.length;
        const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) {
          for (let j = m - 1; j >= 0; j--) {
            if (keysLeft[i] === keysRight[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
          }
        }
        const aligned = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
          if (keysLeft[i] === keysRight[j]) { aligned.push({ leftIndex: i, rightIndex: j }); i++; j++; }
          else if (dp[i + 1][j] >= dp[i][j + 1]) { aligned.push({ leftIndex: i, rightIndex: null }); i++; }
          else { aligned.push({ leftIndex: null, rightIndex: j }); j++; }
        }
        while (i < n) { aligned.push({ leftIndex: i++, rightIndex: null }); }
        while (j < m) { aligned.push({ leftIndex: null, rightIndex: j++ }); }
        return aligned;
      }

      // Patience diff with LCS fallback for very large inputs
      static alignByKeysSmart(keysLeft, keysRight) {
        const N = keysLeft.length;
        const M = keysRight.length;
        // If reasonably small, use classic LCS (simpler and accurate)
        const LCS_CELLS_THRESHOLD = 2_000_000; // up to ~2000x1000 safely
        if (N === 0 && M === 0) return [];
        if (N * M <= LCS_CELLS_THRESHOLD) {
          return TreeDiffEngine.alignByKeysLCS(keysLeft, keysRight);
        }

        // Build frequency maps
        const freqLeft = new Map();
        const freqRight = new Map();
        for (const k of keysLeft) freqLeft.set(k, (freqLeft.get(k) || 0) + 1);
        for (const k of keysRight) freqRight.set(k, (freqRight.get(k) || 0) + 1);

        // Collect unique anchors (appear exactly once on both sides)
        const anchors = [];
        const rightIndexByKey = new Map();
        for (let j = 0; j < M; j++) {
          const key = keysRight[j];
          if (freqRight.get(key) === 1) rightIndexByKey.set(key, j);
        }
        for (let i = 0; i < N; i++) {
          const key = keysLeft[i];
          if (freqLeft.get(key) === 1 && rightIndexByKey.has(key)) {
            anchors.push({ i, j: rightIndexByKey.get(key) });
          }
        }

        // If no anchors or too few, fall back to greedy split to keep memory bounded
        if (anchors.length === 0) {
          return TreeDiffEngine._alignGreedy(keysLeft, keysRight, 0, N, 0, M, LCS_CELLS_THRESHOLD);
        }

        // Compute LIS (by j) over anchors ordered by i to keep order-monotone matches
        anchors.sort((a, b) => a.i - b.i);
        const lisIndices = TreeDiffEngine._lisIndices(anchors.map(a => a.j));
        const lisAnchors = lisIndices.map(idx => anchors[idx]);

        // Recursively align segments around anchors, using LCS for small segments
        const out = [];
        let aStart = 0, bStart = 0;
        for (const { i: ai, j: bj } of lisAnchors) {
          // Prefix segment before this anchor
          if (ai > aStart || bj > bStart) {
            const seg = TreeDiffEngine._alignSegment(keysLeft, keysRight, aStart, ai, bStart, bj, LCS_CELLS_THRESHOLD);
            out.push(...seg);
          }
          // The anchor match itself
          out.push({ leftIndex: ai, rightIndex: bj });
          aStart = ai + 1;
          bStart = bj + 1;
        }
        // Trailing segment after last anchor
        if (aStart < N || bStart < M) {
          const seg = TreeDiffEngine._alignSegment(keysLeft, keysRight, aStart, N, bStart, M, LCS_CELLS_THRESHOLD);
          out.push(...seg);
        }
        return out;
      }

      static _alignSegment(keysLeft, keysRight, aStart, aEnd, bStart, bEnd, LCS_CELLS_THRESHOLD) {
        const n = aEnd - aStart;
        const m = bEnd - bStart;
        if (n === 0 && m === 0) return [];
        if (n * m <= LCS_CELLS_THRESHOLD) {
          const lcs = TreeDiffEngine.alignByKeysLCS(
            keysLeft.slice(aStart, aEnd),
            keysRight.slice(bStart, bEnd)
          );
          return lcs.map(p => ({
            leftIndex: p.leftIndex != null ? aStart + p.leftIndex : null,
            rightIndex: p.rightIndex != null ? bStart + p.rightIndex : null
          }));
        }
        return TreeDiffEngine._alignGreedy(keysLeft, keysRight, aStart, aEnd, bStart, bEnd, LCS_CELLS_THRESHOLD);
      }

      static _alignGreedy(keysLeft, keysRight, aStart, aEnd, bStart, bEnd, LCS_CELLS_THRESHOLD) {
        const aligned = [];
        for (let i = aStart; i < aEnd; i++) aligned.push({ leftIndex: i, rightIndex: null });
        for (let j = bStart; j < bEnd; j++) aligned.push({ leftIndex: null, rightIndex: j });
        return aligned;
      }

      // Return indices of one LIS (not necessarily unique) for sequence arr
      static _lisIndices(arr) {
        const n = arr.length;
        const tails = [];
        const prev = new Array(n).fill(-1);
        const idxAtLen = [];
        for (let i = 0; i < n; i++) {
          let x = arr[i];
          let l = 0, r = tails.length;
          while (l < r) {
            const mid = (l + r) >> 1;
            if (tails[mid] < x) l = mid + 1; else r = mid;
          }
          if (l === tails.length) {
            tails.push(x);
            idxAtLen.push(i);
          } else {
            tails[l] = x;
            idxAtLen[l] = i;
          }
          prev[i] = l > 0 ? idxAtLen[l - 1] : -1;
        }
        // Reconstruct indices
        const res = [];
        let k = idxAtLen[tails.length - 1];
        while (k !== -1) { res.push(k); k = prev[k]; }
        res.reverse();
        return res;
      }

      static splitValueIntoCellsWithCache(row, caches) {
        const out = { line: '', code: '', type: '', objectCount: '', dataSize: '' };
        const node = row.node;
        if (!node) return out;
        out.line = node.line || '';
        if (node.isProperty || node.isEndMarker) {
          out.code = node.code != null ? String(node.code) : '';
        } else {
          out.code = ((node.properties && node.properties.length) || (node.children && node.children.length)) ? '0' : '';
        }
        if (node.isProperty) {
          out.type = (typeof node.data === 'string') ? node.data : (node.data ?? '');
        } else {
          if (node.type) {
            if (node.type.toUpperCase() === 'CLASS' && node.classId !== undefined) {
              let className = '';
              if (node.properties) {
                for (const prop of node.properties) { if (Number(prop.code) === 1) { className = prop.value; break; } }
              }
              out.type = node.type + ' (' + className + ') ' + ' (ID=' + node.classId + ')';
            } else if (node.type.toUpperCase() === 'SECTION' || node.type.toUpperCase() === 'BLOCK' || node.type.toUpperCase() === 'TABLE' || (node.parentType && node.parentType.toUpperCase() === 'TABLE')) {
              let nameValue = '';
              if (node.properties) {
                for (const prop of node.properties) { if (Number(prop.code) === 2) { nameValue = prop.value; break; } }
              }
              out.type = nameValue ? node.type + ' (' + nameValue + ')' : (node.type || '');
            } else {
              out.type = node.type || '';
            }
          }
        }
        if (!node.isProperty && node.children && node.children.length) {
          const countDesc = (n) => {
            if (!n.children || n.children.length === 0) return 0;
            if (caches.objectCount.has(n)) return caches.objectCount.get(n);
            let c = 0; for (let ch of n.children) { if (!ch.isProperty) { c++; if (ch.children && ch.children.length) c += countDesc(ch); } }
            caches.objectCount.set(n, c);
            return c;
          };
          out.objectCount = String(countDesc(node));
        } else out.objectCount = '';
        const size = (n) => {
          if (caches.dataSize.has(n)) return caches.dataSize.get(n);
          let s = 0;
          if (n.isProperty) s += n.data ? n.data.length : 0;
          else {
            s += n.type ? n.type.length : 0;
            if (n.properties && n.properties.length) { for (let p of n.properties) s += p.value ? p.value.length : 0; }
            if (n.children && n.children.length) { for (let ch of n.children) s += size(ch); }
          }
          caches.dataSize.set(n, s);
          return s;
        };
        out.dataSize = String(size(node));
        return out;
      }

      static computeDiff(leftTree, rightTree, options = {}) {
        const leftFlat = TreeDiffEngine.flattenTreeWithKeys(leftTree, options);
        const rightFlat = TreeDiffEngine.flattenTreeWithKeys(rightTree, options);
        const keysLeft = leftFlat.map(r => r.key);
        const keysRight = rightFlat.map(r => r.key);
        const aligned = TreeDiffEngine.alignByKeysSmart(keysLeft, keysRight);
        const leftRowClasses = new Map();
        const rightRowClasses = new Map();
        const leftCellClasses = new Map();
        const rightCellClasses = new Map();
        const totalRows = aligned.length;
        const caches = { objectCount: new Map(), dataSize: new Map() };
        for (let idx = 0; idx < totalRows; idx++) {
          const pair = aligned[idx];
          const lIdx = pair.leftIndex;
          const rIdx = pair.rightIndex;
          if (lIdx != null && rIdx != null) {
            const l = leftFlat[lIdx];
            const r = rightFlat[rIdx];
            if (l.value !== r.value) {
              leftRowClasses.set(idx, 'diff-changed');
              rightRowClasses.set(idx, 'diff-changed');
            }
            const lParts = TreeDiffEngine.splitValueIntoCellsWithCache(l, caches);
            const rParts = TreeDiffEngine.splitValueIntoCellsWithCache(r, caches);
            const lMap = {}; const rMap = {};
            if (lParts.line !== rParts.line) { lMap.line = 'cell-changed'; rMap.line = 'cell-changed'; }
            if (lParts.code !== rParts.code) { lMap.code = 'cell-changed'; rMap.code = 'cell-changed'; }
            if (lParts.type !== rParts.type) { lMap.type = 'cell-changed'; rMap.type = 'cell-changed'; }
            if (lParts.objectCount !== rParts.objectCount) { lMap.objectCount = 'cell-changed'; rMap.objectCount = 'cell-changed'; }
            if (lParts.dataSize !== rParts.dataSize) { lMap.dataSize = 'cell-changed'; rMap.dataSize = 'cell-changed'; }
            if (Object.keys(lMap).length) leftCellClasses.set(idx, lMap);
            if (Object.keys(rMap).length) rightCellClasses.set(idx, rMap);
          } else if (lIdx != null) {
            leftRowClasses.set(idx, 'diff-removed');
            leftCellClasses.set(idx, { line: 'cell-removed', code: 'cell-removed', type: 'cell-removed', objectCount: 'cell-removed', dataSize: 'cell-removed' });
          } else if (rIdx != null) {
            rightRowClasses.set(idx, 'diff-added');
            rightCellClasses.set(idx, { line: 'cell-added', code: 'cell-added', type: 'cell-added', objectCount: 'cell-added', dataSize: 'cell-added' });
          }
        }
        return { aligned, totalRows, leftRowClasses, rightRowClasses, leftCellClasses, rightCellClasses };
      }
    }

    window.TreeDiffEngine = TreeDiffEngine;


