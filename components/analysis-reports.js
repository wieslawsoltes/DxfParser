/* Purpose-specific analysis data models. Never recover CAD identity from a
 * formatted label: navigation closures capture the actual source tab and node. */
(function (global) {
  'use strict';
  const A = global.DxfAnalysis, { AnalysisView } = A, { element: el } = global.DxfGrid;
  const byId = id => document.getElementById(id);
  const prop = (node, code, fallback = '') => node.properties?.find(p => Number(p.code) === code)?.value ?? fallback;
  const kind = node => String(node.type || '').toUpperCase();
  const nameOf = node => String(prop(node, 2, node.type || 'Object'));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const handle = value => String(value ?? '').trim().toUpperCase();
  const percent = (part, total) => total ? +(100 * part / total).toFixed(2) : 0;
  const categories = [
    ['structural','Structural'], ['integrity','Integrity'], ['rendering','Rendering'], ['text','Text'],
    ['performance','Performance'], ['compliance','Compliance'], ['bestPractices','Best practices'], ['security','Security']
  ];
  function inspect(tab) {
    const nodes = [], stack = (tab?.originalTreeData || []).map(node => [node, 1]).reverse(), seen = new Set();
    const types = new Map(), codes = new Map(), handles = new Map(), incoming = new Map(), size = new Map();
    let depth = 0, properties = 0, characters = 0;
    while (stack.length) {
      const [node, level] = stack.pop(); if (!node || seen.has(node)) continue;
      seen.add(node); if (node.isProperty) continue;
      nodes.push(node); depth = Math.max(depth, level);
      const type = kind(node); if (!types.has(type)) types.set(type, []); types.get(type).push(node);
      let selfSize = String(node.type || '').length;
      for (const p of node.properties || []) {
        properties++; selfSize += String(p.value ?? '').length;
        const code = Number(p.code); if (!codes.has(code)) codes.set(code, []); codes.get(code).push({ node, property: p });
        if (code !== 5 && code !== 105 && global.isHandleCode?.(code)) {
          const key = handle(p.value); if (!incoming.has(key)) incoming.set(key, []); incoming.get(key).push({ node, property: p });
        }
      }
      size.set(node, selfSize); characters += selfSize;
      if (node.handle) { const key = handle(node.handle); if (!handles.has(key)) handles.set(key, []); handles.get(key).push(node); }
      for (let i = (node.children?.length || 0) - 1; i >= 0; i--) stack.push([node.children[i], level + 1]);
    }
    for (let i = nodes.length - 1; i >= 0; i--) for (const child of nodes[i].children || []) size.set(nodes[i], size.get(nodes[i]) + (size.get(child) || 0));
    return { tab, nodes, types, codes, handles, incoming, size, depth, properties, characters, positions: new Map(nodes.map((node, i) => [node, i])) };
  }
  function mtextPlain(raw) {
    // A deliberately bounded text preview, not a replacement for the renderer's
    // typesetter. The untouched source and every group-code value remain available.
    return String(raw).replace(/\\\\/g, '\u0000').replace(/\\P/g, '\n').replace(/\\~/g, '\u00a0')
      .replace(/\\[LlOoKk]/g, '').replace(/\\[ACHQSTWFacf][^;]*;/g, match => match[1] === 'S' ? match.slice(2, -1).replace(/[\^#]/g, '/') : '')
      .replace(/[{}]/g, '').replace(/\u0000/g, '\\');
  }
  class AnalysisReports {
    constructor(app) {
      this.app = app; this.views = new Map(); this.originals = new Map(); this.abort = new AbortController();
      this.nodeKeys = new WeakMap(); this.nodeSequence = 0; this.diagnosticGeneration = 0; this.diagnosticResults = new Map(); this.disposed = false;
      this.install();
    }
    replace(name, implementation) { this.originals.set(name, this.app[name]); this.app[name] = implementation.bind(this); }
    bind(panel, tab) { this.app.documentWorkspace?.bindReport(panel, tab); return tab; }
    current(panel) { return this.bind(panel, this.app.getActiveTab()); }
    source(tab) {
      const record = this.app.documentWorkspace?.findByTab(tab?.id);
      if (!record) throw new Error('The source drawing is closed. Reopen the analysis from a loaded drawing.');
      this.app.documentWorkspace.activate(record, { focus: false }); return record;
    }
    jump(tab, node, panel) {
      const record = this.source(tab);
      if (!inspect(tab).nodes.includes(node)) throw new Error('This object is no longer in the source drawing. Refresh the report.');
      this.app.documentWorkspace.revealNode(record, node);
      if (panel) this.app.dismissReportAfterNavigation(panel);
    }
    key(snapshot, node) {
      if (!this.nodeKeys.has(node)) this.nodeKeys.set(node, ++this.nodeSequence);
      return `${snapshot.tab?.id}:node:${this.nodeKeys.get(node)}`;
    }
    row(snapshot, node, panel, related = true) {
      const row = { key: this.key(snapshot, node), values: [nameOf(node), kind(node), node.handle || '', number(node.line), prop(node, 8)], node,
        raw: () => this.app.dxfParser.serializeNode(node),
        actions: [{ label: 'Show in Tree', run: () => this.jump(snapshot.tab, node, panel) },
          { label: 'Copy DXF', run: () => navigator.clipboard.writeText(this.app.dxfParser.serializeNode(node)) }] };
      if (related) row.related = () => {
        const properties = (node.properties || []).map((p, i) => {
          const candidates = ![5,105].includes(Number(p.code)) && global.isHandleCode?.(Number(p.code))
            ? snapshot.handles.get(handle(p.value)) || [] : [];
          return { key: `${row.key}:p:${i}`, values: [number(p.code), String(p.value ?? ''), number(p.line)],
            actions: candidates.length === 1 ? [{ label: 'Follow reference', run: () => this.jump(snapshot.tab, candidates[0], panel) }] : [],
            metadata: candidates.length > 1 ? [['Reference', 'Ambiguous handle: choose a candidate from Related.']] : [],
            related: candidates.length > 1 ? () => [this.collection(snapshot, candidates, panel, 'Reference candidates')] : [] };
        });
        const usages = snapshot.incoming.get(handle(node.handle)) || [];
        return [ { title: 'DXF properties', columns: ['Code','Value','Line'], rows: properties },
          ...(usages.length ? [{ title: 'Referenced by', columns: ['Object','Type','Handle','Line','Layer','Reference code'],
            rows: usages.map((ref, i) => { const r = this.row(snapshot, ref.node, panel, false); return { ...r, key: r.key + ':ref:' + i, values: [...r.values, number(ref.property.code)] }; }) }] : []) ];
      };
      return row;
    }
    collection(snapshot, nodes, panel, title = 'Occurrences') {
      return { title, columns: ['Object','Type','Handle','Line','Layer'], rows: nodes.map(node => this.row(snapshot, node, panel, false)) };
    }
    render(panel, containerId, options) {
      const root = byId(panel), container = byId(containerId); if (!container) return;
      root.classList.add('analysis-enhanced'); container.classList.add('analysis-report-host');
      let entry = this.views.get(containerId);
      if (!entry || !entry.view.host.isConnected) {
        entry?.view.dispose(); container.replaceChildren();
        const kpis = el('div', 'analysis-kpis'), note = el('p', 'analysis-report-note'); container.append(kpis, note);
        const view = new AnalysisView(container, options);
        entry = { view, kpis, note }; this.views.set(containerId, entry);
        if (options.details === false) view.toggleDetails(false);
      } else entry.view.setRows(options.rows || []);
      entry.kpis.replaceChildren();
      for (const [label, value] of options.kpis || []) { const card = el('div', 'analysis-kpi'); card.append(el('strong', '', typeof value === 'number' ? value.toLocaleString() : value), el('span', '', label)); entry.kpis.append(card); }
      entry.note.textContent = options.note || ''; entry.note.hidden = !options.note;
      container._dataGrid = entry.view;
      entry.view.setTheme(this.app.tabularReports?.theme || 'light');
      return entry.view;
    }
    install() {
      this.replace('updateStats', this.statistics);
      this.replace('updateClouds', this.frequencies);
      this.replace('updateDependencies', this.dependencies);
      this.replace('updateHandleMap', this.ownership);
      this.replace('updateFonts', this.fonts);
      this.replace('updateClasses', this.classes);
      this.replace('filterClassesByAppName', function (name) { const view = this.classes(); view.facetValues.set(2, String(name)); view.buildFacets(); view.refresh(); });
      this.replace('updateLineTypes', this.lineTypes);
      this.replace('updateTexts', this.texts);
      this.replace('showBinaryObjectsOverlay', this.binary);
      this.replace('showProxyObjectsOverlay', this.proxies);
      this.replace('showObjectSizeDialog', this.objectSizes);
      this.replace('renderObjectSizeList', this.objectSizes);
      for (const node of byId('cloudOverlay').querySelectorAll('h3,#overlayCodeCloud')) node.classList.add('analysis-legacy');
      byId('blocksOverlay').classList.add('analysis-enhanced'); byId('overlayBlocksContent').classList.add('analysis-block-host');
      byId('ruleConfigOverlay').classList.add('analysis-enhanced');
      const profiles=byId('ruleConfigOverlay').querySelector('.rule-profiles');
      const disclosure=el('details','analysis-config-profiles');disclosure.append(el('summary','','Profiles and configuration files'));profiles.before(disclosure);disclosure.append(profiles);
      byId('selectAllRulesBtn').textContent='Enable all rules';byId('deselectAllRulesBtn').textContent='Disable all rules';
      this.installDiagnostics();
      const w = this.app.dockingWorkspace;
      if (w) {
        w.unsubscribers.push(w.manager.ThemeChanged.add(() => {
          const theme = this.app.tabularReports.theme; for (const entry of this.views.values()) entry.view.setTheme(theme);
        }));
        const original = w.dispose.bind(w);
        w.dispose = () => { this.dispose(); original(); };
      }
    }
    statistics() {
      const panel = 'statsOverlay', s = inspect(this.current(panel));
      const rows = [...s.types].map(([type, nodes]) => ({ key: s.tab?.id + ':type:' + type,
        values: [type, nodes.length, percent(nodes.length, s.nodes.length), nodes.reduce((sum, n) => sum + (n.properties?.length || 0), 0)],
        related: () => [this.collection(s, nodes, panel)], actions: [{ label: 'Show first', run: () => this.jump(s.tab, nodes[0], panel) }] }));
      return this.render(panel, 'overlayStatsContent', { title: 'Object type distribution', columns: ['Type', { title: 'Count', width: 105, bar: true }, 'Share (%)','Properties'], rows,
        kpis: [['Objects',s.nodes.length],['Properties',s.properties],['Nesting depth',s.depth],['Characters',s.characters]],
        note: 'Counts are from the full source drawing, not the filtered tree. Select a type to inspect every occurrence.' });
    }
    frequencies() {
      const panel = 'cloudOverlay', s = inspect(this.current(panel));
      const rows = [...s.types].map(([type, nodes]) => ({ key: `${s.tab?.id}:type:${type}`, values: [type,'Object type',nodes.length,percent(nodes.length,s.nodes.length)],
        actions: [{ label: 'Show first', run: () => this.jump(s.tab, nodes[0], panel) }], related: () => [this.collection(s, nodes, panel)] }));
      for (const [code, refs] of s.codes) rows.push({ key: `${s.tab?.id}:code:${code}`, values: [String(code),'Group code',refs.length,percent(refs.length,s.properties)],
        actions: [{ label: 'Show first', run: () => this.jump(s.tab, refs[0].node, panel) }],
        related: () => [{ title: 'Property occurrences', columns: ['Object','Value','Handle','Line'], rows: refs.map((ref, i) => ({ key: `${code}:${i}`, values: [kind(ref.node),String(ref.property.value ?? ''),ref.node.handle || '',number(ref.property.line)],
          actions: [{ label: 'Show in Tree', run: () => this.jump(s.tab, ref.node, panel) }] })) }] });
      return this.render(panel, 'overlayObjectCloud', { title: 'DXF Frequencies', columns: ['Value',{ title:'Kind',facet:true },{title:'Count',bar:true},'Share (%)'], rows,
        note:'Use Kind to distinguish object counts from group-code counts. Related lists every occurrence, including objects without handles.' });
    }
    dependencies() {
      const panel = 'depsOverlay', s = inspect(this.current(panel)), types = new Set(['LTYPE','STYLE','APPID','LAYER','DIMSTYLE','VPORT','XREF','SHAPE','IMAGEDEF','PDFDEFINITION','DWFDEFINITION','DGNDEFINITION']);
      const rows = s.nodes.filter(n => types.has(kind(n)) || kind(n) === 'BLOCK' && prop(n, 1)).map(node => {
        const path = kind(node) === 'STYLE' ? prop(node, 3) : ['BLOCK','XREF','IMAGEDEF','PDFDEFINITION','DWFDEFINITION','DGNDEFINITION'].includes(kind(node)) ? prop(node, 1) : '';
        return { ...this.row(s,node,panel), values:[nameOf(node),kind(node),String(path),node.handle || '',number(node.line),path ? 'External reference' : 'Definition'],
          metadata: [['Resolution','Not probed: this report does not access external paths.']] };
      });
      return this.render(panel, 'overlayDepsContent', { title:'Dependencies', columns:['Name','Type',{title:'Path / font file',width:280},'Handle','Line','Status'],rows,
        note:'Definitions and external references remain separate. External paths are displayed, never fetched or executed.' });
    }
    ownership() {
      const panel = 'handleMapOverlay', s = inspect(this.current(panel));
      const nodes = s.nodes.filter(n => n.handle), rows = new Map(), parents = new Map(), roots = [];
      for (const node of nodes) {
        const owner = handle(prop(node,330)), candidates = s.handles.get(owner);
        const status = (s.handles.get(handle(node.handle))?.length || 0) > 1 ? 'Duplicate handle' : !owner || owner === '0' ? 'Root' : !candidates ? 'Missing owner' : candidates.length > 1 ? 'Ambiguous owner' : 'Owned';
        rows.set(node, { ...this.row(s,node,panel), values:[node.handle,kind(node),owner,number(node.line),status], children:[] });
        if (candidates?.length === 1) parents.set(node,candidates[0]);
      }
      // Functional owner graph: each walk visits nodes once. Cut one edge per
      // cycle while preserving all members and explicitly marking the cycle.
      const finished = new Set();
      for (const node of nodes) {
        const path = [], positions = new Map(); let current = node;
        while (current && !finished.has(current)) {
          if (positions.has(current)) {
            for (const member of path.slice(positions.get(current))) rows.get(member).values[4] = 'Owner cycle';
            parents.delete(current); break;
          }
          positions.set(current,path.length); path.push(current); current=parents.get(current);
        }
        for (const member of path) finished.add(member);
      }
      for (const node of nodes) { const row=rows.get(node), parent=rows.get(parents.get(node)); (parent ? parent.children : roots).push(row); }
      return this.render(panel,'overlayHandleMapContent',{title:'Handle ownership',columns:['Handle','Type','Owner','Line','Status'],rows:roots,
        kpis:[['Handles',nodes.length],['Root groups',roots.length],['Attention', [...rows.values()].filter(r=>!['Root','Owned'].includes(r.values[4])).length]],
        note:'Expand owners to browse owned objects. Search retains matching descendants and their ancestors; cycles, duplicates and unresolved owners remain visible.'});
    }
    fonts() {
      const panel='fontsOverlay', s=inspect(this.current(panel)), styles=new Map(), usages=new Map();
      for(const node of s.types.get('STYLE') || []) styles.set(nameOf(node).toUpperCase(), node);
      for(const node of s.nodes.filter(n=>['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(kind(n)))) {
        const name=String(prop(node,7,'STANDARD'));const key=name.toUpperCase();
        if(!usages.has(key))usages.set(key,[]);usages.get(key).push(node);
      }
      const groups=new Map();
      for(const key of new Set([...styles.keys(),...usages.keys()])) {
        const node=styles.get(key), uses=usages.get(key)||[], file=node ? String(prop(node,3,'(not specified)')) : '(unresolved style)';
        if(!groups.has(file))groups.set(file,{key:`${s.tab?.id}:font:${file}`,values:[file,'Font file','',0,node?'Defined':'Unresolved'],children:[]});
        const parent=groups.get(file);parent.values[3]+=uses.length;
        const row=node?this.row(s,node,panel):{key:`${s.tab?.id}:style:${key}`,actions:[]};
        parent.children.push({...row,values:[node?nameOf(node):key,'Text style',node?String(prop(node,4)):'',uses.length,node?'Defined':'Unresolved'],
          related:()=>[this.collection(s,uses,panel,'Text references'),...(node?[{title:'Style definition',columns:['Code','Value'],rows:(node.properties||[]).map((p,i)=>({key:i,values:[number(p.code),String(p.value??'')]}))}]:[])],
          children:uses.map(n=>({...this.row(s,n,panel,false),values:[`${kind(n)} · ${n.handle||'line '+n.line}`,'Reference',prop(n,8),1,'Used']}))});
      }
      return this.render(panel,'overlayFontsContent',{title:'Fonts and text styles',columns:['Font / style / object','Type','Big font / layer',{title:'References',bar:true},'Status'],rows:[...groups.values()],
        note:'Font file → STYLE definition → text references. Style names are resolved to font files; missing definitions are explicit. No fonts are downloaded.'});
    }
    classNodes(s) {
      const nodes=s.types.get('CLASS')||[];
      if(s.tab){s.tab.classIdToName={};nodes.forEach((n,i)=>{n.classId=500+i;n.className=String(prop(n,1));s.tab.classIdToName[n.classId]=n.className;});}
      return nodes;
    }
    classes() {
      const panel='classesOverlay', s=inspect(this.current(panel)), nodes=this.classNodes(s);
      return this.render(panel,'overlayClassesContent',{title:'Classes',columns:['Class','C++ class','Application','Class ID','Handle'],
        rows:nodes.map(n=>({...this.row(s,n,panel),values:[String(prop(n,1,'Unnamed class')),String(prop(n,2)),String(prop(n,3)),n.classId,n.handle||'']})),
        kpis:[['Classes',nodes.length],['Applications',new Set(nodes.map(n=>prop(n,3))).size]],note:'Filter by application; use Raw data for the complete CLASS record.'});
    }
    lineTypes() {
      const panel='lineTypesOverlay',s=inspect(this.current(panel)), definitions=new Map(), usages=new Map();
      for(const n of s.types.get('LTYPE')||[])definitions.set(nameOf(n).toUpperCase(),n);
      for(const n of s.nodes)if(kind(n)!=='LTYPE')for(const p of n.properties||[])if(Number(p.code)===6){const key=String(p.value).toUpperCase();if(!usages.has(key))usages.set(key,[]);usages.get(key).push(n);}
      const rows=[...new Set([...definitions.keys(),...usages.keys()])].map(key=>{
        const n=definitions.get(key),uses=usages.get(key)||[],node=n||uses[0],row=this.row(s,node,panel);
        const pattern=n?(n.properties||[]).filter(p=>Number(p.code)===49).map(p=>number(p.value)):[];
        return {...row,key:`${s.tab?.id}:linetype:${key}`,values:[n?nameOf(n):key,n?'Defined':['BYLAYER','BYBLOCK','CONTINUOUS'].includes(key)?'Built-in':'Used only',uses.length,n?String(prop(n,3)):'',n?number(prop(n,40)):0,pattern.join(', ')],
          related:()=>[this.collection(s,uses,panel,'Objects using this linetype')],
          preview:host=>{
            host.append(el('p','analysis-report-note','Pattern preview (dash lengths; complex text/shape elements require the drawing renderer).'));
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 300 32');svg.setAttribute('aria-label','Linetype dash preview');svg.setAttribute('role','img');svg.style.width='100%';svg.style.height='32px';
            const total=pattern.reduce((sum,v)=>sum+Math.abs(v),0), scale=total?Math.min(20,80/total):1;let x=0, iterations=0;
            const segments=pattern.length?pattern:[300];
            while(x<300 && iterations++<2000)for(const value of segments){if(x>=300)break;const length=Math.max(value===0?1:2,Math.abs(value)*scale);if(value>=0){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',String(x));line.setAttribute('x2',String(Math.min(300,x+length)));line.setAttribute('y1','16');line.setAttribute('y2','16');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2');svg.append(line);}x+=length;}
            host.append(svg);
          }};
      });
      return this.render(panel,'overlayLineTypesContent',{title:'Line Types',columns:['Name','Origin',{title:'References',bar:true},'Description','Pattern length','Segments'],rows,
        note:'Definitions, built-ins and unresolved usages are distinguished. Select a linetype for its pattern and every referencing object.'});
    }
    texts() {
      const panel='textsOverlay',s=inspect(this.current(panel)),nodes=s.nodes.filter(n=>['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(kind(n)));
      const rows=nodes.map(n=>{
        const raw=kind(n)==='MTEXT'?[...(n.properties||[]).filter(p=>Number(p.code)===3),...(n.properties||[]).filter(p=>Number(p.code)===1)].map(p=>String(p.value??'')).join(''):String(prop(n,1));
        return {...this.row(s,n,panel),values:[mtextPlain(raw),kind(n),String(prop(n,8)),String(prop(n,7,'STANDARD')),n.handle||'',number(n.line)],
          metadata:[['Raw text',raw],['Height',prop(n,40)],['Insertion point',[prop(n,10,0),prop(n,20,0),prop(n,30,0)].join(', ')]],
          preview:host=>{host.append(el('p','analysis-report-note','Readable text preview; Raw data preserves all formatting codes.'),el('div','analysis-full-text',mtextPlain(raw)));}};
      });
      return this.render(panel,'overlayTextsContent',{title:'Texts',columns:[{title:'Text',width:340},'Type','Layer','Style','Handle','Line'],rows,
        note:'Search complete TEXT/MTEXT and attribute content. MTEXT continuation chunks are included; all text is rendered inertly.'});
    }
    binary() {
      const panel='binaryObjectsOverlay',s=inspect(this.current(panel)),nodes=s.nodes.filter(n=>(n.properties||[]).some(p=>Number(p.code)===310));
      const rows=nodes.map(n=>{const chunks=(n.properties||[]).filter(p=>Number(p.code)===310);return{...this.row(s,n,panel),values:[kind(n),n.handle||'',number(n.line),chunks.length,Math.floor(chunks.reduce((sum,p)=>sum+String(p.value??'').replace(/\s/g,'').length,0)/2)],
        actions:[{label:'Hex Viewer',run:()=>{this.source(s.tab);this.app.showHexViewer(chunks.map(p=>p.value).join(''));}},...this.row(s,n,panel,false).actions]};});
      const view=this.render(panel,'binaryObjectsList',{title:'Binary Objects',columns:['Type','Handle','Line','Chunks',{title:'Bytes',bar:true}],rows,note:'Inspect embedded bytes in the existing paged hex / Office viewer. Opening binary content does not close a docked report.'});
      byId(panel).style.display='block';return view;
    }
    proxies() {
      const panel='proxyObjectsOverlay',s=inspect(this.current(panel)),classes=this.classNodes(s),nodes=s.nodes.filter(n=>['ACAD_PROXY_OBJECT','ACAD_PROXY_ENTITY'].includes(kind(n)));
      const rows=nodes.map(n=>{const id=number(prop(n,91)),cls=classes.find(c=>c.classId===id),row=this.row(s,n,panel);return{...row,
        values:[n.handle||`Line ${n.line}`,kind(n),id,cls?String(prop(cls,1)):'Unresolved',number(n.line),(s.incoming.get(handle(n.handle))||[]).length],
        actions:[...row.actions,...(cls?[{label:'Show Class',run:()=>this.jump(s.tab,cls,panel)}]:[])]};});
      const view=this.render(panel,'proxyObjectsList',{title:'Proxy Objects',columns:['Handle','Type','Class ID','Class','Line','References'],rows,
        note:'Inspect raw DXF, class definitions and referencing objects without losing the selected proxy.'});byId(panel).style.display='block';return view;
    }
    objectSizes() {
      const panel='objectSizeOverlay',s=inspect(this.current(panel));
      const nodes=[...s.nodes].sort((a,b)=>s.size.get(b)-s.size.get(a));this.app.sortedNodesByDataSize=nodes;
      const rows=nodes.map(n=>({...this.row(s,n,panel),values:[kind(n),n.handle||'',number(n.line),s.size.get(n),(n.children||[]).length]}));
      const view=this.render(panel,'objectSizeList',{title:'Object Sizes',columns:['Type','Handle','Line',{title:'Characters',bar:true},'Children'],rows,
        note:'Subtree character totals, largest first; not byte sizes. Parent totals include their descendants and must not be added together.'});byId(panel).style.display='block';return view;
    }
    enrichBlocks(rows) {
      const tab = rows.find(row => row.source?.analysisTab)?.source.analysisTab;
      if (!tab) return rows;
      const snapshot = inspect(tab), panel = 'blocksOverlay';
      const targets = value => snapshot.handles.get(handle(value)) || [];
      return rows.map(row => {
        const block = row.source?.analysisBlock;
        if (!block) return row;
        return { ...row, values: [block.name, block.instanceCount || 0, row.values[2], row.values[3],
          row.values[4] || 'Ordinary', block.counters?.unitWarnings ? `${block.counters.unitWarnings} warnings` : 'No warnings'],
          skipSourceCollections: true, raw: () => JSON.stringify(block, null, 2),
          related: () => [
            { title: 'Instances', columns: ['Handle','Space','Layout','Layer','Parent block','Attributes','Scale','Units'],
              rows: (block.instances || []).map((instance, i) => {
                const candidates = targets(instance.handle);
                return { key: `${row.key}:insert:${i}`, values: [instance.handle || '', instance.space || '', instance.layout || '',
                  instance.layer || '', instance.ownerBlock || '', !!instance.hasAttributes,
                  ['x','y','z'].map(axis => instance.scale?.[axis] ?? 1).join(' / '), instance.unitDiagnostics?.summary || ''],
                  raw: () => JSON.stringify(instance, null, 2),
                  actions: candidates.length === 1 ? [{ label: 'Show in Tree', run: () => this.jump(tab, candidates[0], panel) }] : [],
                  related: candidates.length ? () => [this.collection(snapshot, candidates, panel, candidates.length === 1 ? 'DXF instance' : 'Reference candidates')] : [] };
              }) },
            { title: 'Attribute definitions', columns: ['Tag','Prompt','Default value','Style','Height','Visibility','Flags'],
              rows: (block.attributeDefinitions || []).map((def, i) => ({ key: `${row.key}:attribute:${i}`,
                values: [def.tag || '',def.prompt || '',def.defaultValue || '',def.textStyle || '',def.height ?? '',def.visibility || '',def.flags ?? 0],
                raw: () => JSON.stringify(def, null, 2) })) },
            { title: 'Block diagnostics', columns: ['Message','Severity','Category','Insert','Space','Layout'],
              rows: (block.diagnostics || []).map((diag, i) => ({ key: `${row.key}:diagnostic:${i}`,
                values: [diag.message || '',diag.severity || '',diag.category || '',diag.instanceHandle || '',diag.space || '',diag.layout || ''],
                raw: () => JSON.stringify(diag, null, 2),
                actions: targets(diag.instanceHandle).length === 1 ? [{ label: 'Show in Tree', run: () => this.jump(tab, targets(diag.instanceHandle)[0], panel) }] : [] })) },
            ...(targets(block.handle).length ? [this.collection(snapshot, targets(block.handle), panel, 'Block definition')] : [])
          ] };
      });
    }
    installDiagnostics() {
      const root=byId('diagnosticsOverlay');root.classList.add('analysis-enhanced');
      for(const id of ['diagnosticsTabs','diagnosticsTabContent','diagnosticsFilters'])byId(id).classList.add('analysis-legacy','dxf-grid-source');
      byId('diagnosticsStats').classList.add('analysis-summary-cards');
      const host=el('div','analysis-diagnostics-host analysis-report-host');host.id='analysisDiagnostics';byId('diagnosticsSummary').append(host);
      this.replace('showDiagnosticsOverlay',function(){const tab=this.current('diagnosticsOverlay');byId('diagnosticsOverlay').style.display='block';this.diagnostics(this.diagnosticResults.get(tab?.id),tab);});
      this.replace('displayDiagnosticsResults',function(results,tab=this.app.getActiveTab()){this.diagnosticResults.set(tab?.id,results);this.diagnostics(results,tab);});
      this.replace('runDiagnostics',async function(){
        const tab=this.current('diagnosticsOverlay');if(!tab)return;
        const generation=++this.diagnosticGeneration;this.app.showDiagnosticsProgress();byId('runDiagnosticsBtn').disabled=true;
        try{
          const Engine=global.DXFDiagnosticsEngine || DXFDiagnosticsEngine;
          const engine=new Engine(tab.originalTreeData,tab.name,this.app.ruleConfiguration);
          const results=await engine.runFullDiagnostics((value,message)=>{if(generation===this.diagnosticGeneration&&!this.disposed)this.app.updateDiagnosticsProgress(value,message);});
          if(generation===this.diagnosticGeneration&&!this.disposed){this.diagnosticResults.set(tab.id,results);this.diagnostics(results,tab);}
        }catch(error){if(!this.disposed)this.app.dockingWorkspace.notify('Diagnostics failed: '+error.message,true);}
        finally{if(generation===this.diagnosticGeneration&&!this.disposed){this.app.hideDiagnosticsProgress();byId('runDiagnosticsBtn').disabled=false;}}
      });
      this.replace('filterDiagnosticsBySeverity',function(severity){const view=this.views.get('analysisDiagnostics')?.view;if(!view)return;if(severity==='all')view.facetValues.delete(1);else view.facetValues.set(1,severity);view.buildFacets();view.refresh();});
      this.replace('switchDiagnosticsTab',function(category){const view=this.views.get('analysisDiagnostics')?.view;if(!view)return;const label=categories.find(([id])=>id===category||id==='bestPractices'&&category==='best-practices')?.[1];if(label)view.facetValues.set(2,label);else view.facetValues.delete(2);view.buildFacets();view.refresh();});
      this.replace('applyDiagnosticsFilters',function(){const view=this.views.get('analysisDiagnostics')?.view;if(!view)return;view.search.value=byId('diagnosticsSearchInput').value;view.refresh();});
    }
    diagnostics(results,tab) {
      const panel='diagnosticsOverlay';this.bind(panel,tab);this.app.lastDiagnosticsResults=results||null;
      const rows=[];
      for(const [key,label] of categories)for(const [i,issue]of(results?.[key]||[]).entries())rows.push({key:`${tab?.id}:${key}:${i}`,values:[String(issue.title||''),String(issue.severity||'info').toLowerCase(),label,String(issue.description||''),String(issue.location||'')],
        metadata:issue.category?[['Check',String(issue.category)]]:[],raw:()=>JSON.stringify(issue,null,2),
        actions:(issue.actions||[]).map(action=>({label:String(action.label||action.type),run:()=>{
          const record=this.source(tab);
          if(action.type==='navigate'||action.type==='highlight'){
            const node=this.app.dxfParser.findNodeByIdIterative(tab.originalTreeData,action.data);if(!node)throw new Error('The diagnostic object no longer exists. Run Analysis again.');
            this.app.documentWorkspace.revealNode(record,node);this.app.dismissReportAfterNavigation(panel);
          }else this.app.handleDiagnosticAction(action.type,action.data);
        }}))});
      const counts={totalIssues:rows.length,criticalIssues:0,errorIssues:0,warningIssues:0,infoIssues:0,suggestions:0};
      for(const row of rows){const field={critical:'criticalIssues',error:'errorIssues',warning:'warningIssues',info:'infoIssues',suggestion:'suggestions'}[row.values[1]];if(field)counts[field]++;}
      this.app.updateDiagnosticsStats(counts);
      for(const card of byId('diagnosticsStats').children){card.tabIndex=0;card.setAttribute('role','button');card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}});}
      byId('diagnosticsSummary').style.display='block';
      const view=this.render(panel,'analysisDiagnostics',{title:'Diagnostic Issues',columns:[{title:'Issue',width:280},'Severity','Category',{title:'Description',width:380},'Location'],rows,
        emptyMessage:results?'No issues found by the enabled checks.':'Run Analysis to inspect the source drawing.',
        onFilterChange: v => {
          const severity = v.facetValues.get(1) || 'all';
          for (const card of byId('diagnosticsStats').children) {
            const active = card.dataset.filter === severity;
            card.classList.toggle('active', active); card.setAttribute('aria-pressed', String(active));
          }
        },
        note:results?'Each issue appears once. Filter by severity or category, then read the full description and actions in Details.':'Run Analysis to populate this report. No issues have been evaluated yet.'});
      view.options.emptyMessage=results?'No issues found by the enabled checks.':'Run Analysis to inspect the source drawing.';view.refresh();
      byId('exportDiagnosticsBtn').disabled=!results;
      return view;
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.diagnosticGeneration++;this.abort.abort();for(const {view}of this.views.values())view.dispose();this.views.clear();this.diagnosticResults.clear();for(const[name,method]of this.originals)this.app[name]=method;}
  }
  A.inspect=inspect;A.mtextPlain=mtextPlain;A.AnalysisReports=AnalysisReports;
  A.install=app=>app.analysisReports=new AnalysisReports(app);
})(window);
