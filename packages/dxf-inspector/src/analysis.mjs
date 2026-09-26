import { isHandleCode } from './utils.mjs';
const prop = (node, code, fallback = '') => node.properties?.find(p => Number(p.code) === code)?.value ?? fallback;
const kind = node => String(node.type || '').toUpperCase();
const nameOf = node => String(prop(node, 2, node.type || 'Object'));
const handle = value => String(value ?? '').trim().toUpperCase();

/** Build source identity and reference indexes without DOM or rendering dependencies.
 * The caller owns the immutable source snapshot; do not mutate its tree while using the indexes.
 */
export function inspectTree(tab) {
    const nodes = [], stack = (tab?.originalTreeData || []).map(node => [node, 1, null]).reverse(), seen = new Set(), parents = new Map();
    const types = new Map(), codes = new Map(), handles = new Map(), incoming = new Map(), size = new Map();
    let depth = 0, properties = 0, characters = 0;
    while (stack.length) {
      const [node, level, parent] = stack.pop(); if (!node || seen.has(node)) continue;
      seen.add(node); if (node.isProperty) continue;
      if (parent) parents.set(node, parent);
      nodes.push(node); depth = Math.max(depth, level);
      const type = kind(node); if (!types.has(type)) types.set(type, []); types.get(type).push(node);
      let selfSize = String(node.type || '').length;
      for (const p of node.properties || []) {
        properties++; selfSize += String(p.value ?? '').length;
        const code = Number(p.code); if (!codes.has(code)) codes.set(code, []); codes.get(code).push({ node, property: p });
        if (code !== 5 && code !== 105 && isHandleCode(code)) {
          const key = handle(p.value); if (!incoming.has(key)) incoming.set(key, []); incoming.get(key).push({ node, property: p });
        }
      }
      size.set(node, selfSize); characters += selfSize;
      if (node.handle) { const key = handle(node.handle); if (!handles.has(key)) handles.set(key, []); handles.get(key).push(node); }
      for (let i = (node.children?.length || 0) - 1; i >= 0; i--) stack.push([node.children[i], level + 1, node]);
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
      const parent = parents.get(nodes[i]);
      if (parent) size.set(parent, size.get(parent) + size.get(nodes[i]));
    }
    return { tab, nodes, types, codes, handles, incoming, size, depth, properties, characters, positions: new Map(nodes.map((node, i) => [node, i])) };
  }
  // Index actual references, including named table references, once per report
  // snapshot. Ambiguous handles/names retain every candidate, never first-match.
export function referenceIndex(snapshot) {
    if (snapshot.references) return snapshot.references;
    const outgoing = new Map(), incoming = new Map(), names = new Map();
    for (const type of ['LAYER','LTYPE','STYLE','DIMSTYLE','BLOCK']) {
      const table = new Map();
      for (const node of snapshot.types.get(type) || []) {
        const key = nameOf(node).toUpperCase(); if (!table.has(key)) table.set(key, []); table.get(key).push(node);
      }
      names.set(type, table);
    }
    for (const node of snapshot.nodes) for (const p of node.properties || []) {
      const code = Number(p.code), value = String(p.value ?? '').trim();
      let candidates = null, relation = '';
      if (![5,105].includes(code) && isHandleCode(code) && value && value !== '0') {
        candidates = snapshot.handles.get(handle(value)) || []; relation = (code === 330 ? 'Owner / pointer' : 'Handle reference') + ` · ${code}`;
      } else {
        const target = code === 8 ? 'LAYER' : code === 6 ? 'LTYPE' : code === 7 && ['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(kind(node)) ? 'STYLE' :
          code === 2 && kind(node) === 'INSERT' ? 'BLOCK' : code === 3 && kind(node) === 'DIMENSION' ? 'DIMSTYLE' : null;
        if (target && value && !['BYLAYER','BYBLOCK'].includes(value.toUpperCase())) {
          candidates = names.get(target).get(value.toUpperCase()) || []; relation = target + ` name · ${code}`;
        }
      }
      if (!candidates) continue;
      if (!outgoing.has(node)) outgoing.set(node, []);
      if (!candidates.length) outgoing.get(node).push({ node:null, value, label:'Unresolved ' + relation });
      for (const target of candidates) {
        const label = (candidates.length > 1 ? 'Ambiguous ' : '') + relation;
        outgoing.get(node).push({node:target, label});
        if (!incoming.has(target)) incoming.set(target, []); incoming.get(target).push({node, label});
      }
    }
    return snapshot.references = {incoming,outgoing};
  }
export function mtextPlain(raw) {
    // A deliberately bounded text preview, not a replacement for the renderer's
    // typesetter. The untouched source and every group-code value remain available.
    return String(raw).replace(/\\\\/g, '\u0000').replace(/\\P/g, '\n').replace(/\\~/g, '\u00a0')
      .replace(/\\[LlOoKk]/g, '').replace(/\\[ACHQSTWFacf][^;]*;/g, match => match[1] === 'S' ? match.slice(2, -1).replace(/[\^#]/g, '/') : '')
      .replace(/[{}]/g, '').replace(/\u0000/g, '\\');
  }
