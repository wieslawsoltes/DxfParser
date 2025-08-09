    class TreeDiffEngine {
      static sortProps(props) {
        return (props || []).slice().sort((a, b) => {
          const ac = Number(a.code) || 0;
          const bc = Number(b.code) || 0;
          return ac - bc;
        });
      }

      static getNodeSemanticId(node) {
        if (!node || node.isProperty) return '';
        if (node.handle) return `H:${node.handle}`;
        const type = node.type ? node.type.toUpperCase() : '';
        let name = '';
        if (type === 'SECTION' || type === 'BLOCK' || type === 'TABLE' || (node.parentType && node.parentType.toUpperCase() === 'TABLE')) {
          if (node.properties) {
            const p2 = node.properties.find(p => Number(p.code) === 2);
            if (p2) name = p2.value;
          }
        }
        if (type === 'CLASS' && node.classId !== undefined) {
          name = `CLASSID:${node.classId}`;
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

      static flattenTreeWithKeys(nodes) {
        const rows = [];
        const traverse = (list, level, parentPath) => {
          for (const n of list || []) {
            const id = TreeDiffEngine.getNodeSemanticId(n);
            const path = parentPath ? `${parentPath}/${id}` : id;
            rows.push({ key: `N|${path}`, value: TreeDiffEngine.stringifyNodeValue(n, level), node: n, level });
            if (n.properties && n.properties.length) {
              const propsSorted = TreeDiffEngine.sortProps(n.properties);
              for (const p of propsSorted) {
                const pKey = `P|${path}|${p.code}`;
                rows.push({ key: pKey, value: `P|${p.code}|${p.value ?? ''}`, node: { isProperty: true, code: p.code, data: p.value }, level: level + 1 });
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

      static computeDiff(leftTree, rightTree) {
        const leftFlat = TreeDiffEngine.flattenTreeWithKeys(leftTree);
        const rightFlat = TreeDiffEngine.flattenTreeWithKeys(rightTree);
        const keysLeft = leftFlat.map(r => r.key);
        const keysRight = rightFlat.map(r => r.key);
        const aligned = TreeDiffEngine.alignByKeysLCS(keysLeft, keysRight);
        const leftRowClasses = new Map();
        const rightRowClasses = new Map();
        const leftCellClasses = new Map();
        const rightCellClasses = new Map();
        const totalRows = aligned.length;
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
            const lParts = TreeDiffEngine.splitValueIntoCells(l);
            const rParts = TreeDiffEngine.splitValueIntoCells(r);
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


