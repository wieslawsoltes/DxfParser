import { createAnalysisUI, createAnalysisDocking } from '../packages/dxf-analysis/index.mjs';
const Layout = createAnalysisDocking({window, dockyard: window.AvalonDock});
const host = {window, treeDataGridCore:window.TreeDataGridCore, treeDataGridWeb:window.TreeDataGridWeb, gridWeb:window.GridWeb,
    createLayout:options=>new Layout({...options,storage:window.localStorage,storageKey:'demo.analysis.'+options.title})};
const ui = createAnalysisUI(host);
const rows = Array.from({length:60},(_,i)=>({key:i,values:['Equipment '+i, i%3===0?'Pump':'Valve',i+1],
    raw:'0\nINSERT\n5\n'+i.toString(16),metadata:[['Drawing','revision-a.dxf']],
    related:()=>[{title:'Related objects',columns:['Handle','Type'],rows:[{key:'related',values:['AB','LINE']}]}]}));
const v = new ui.AnalysisView(document.getElementById('primary'),{title:'Equipment analysis',columns:['Name','Type','Count'],rows,
    visualization:{group:'Type',measure:'Count'}});
const second = new ui.AnalysisView(document.getElementById('secondary'),{title:'Independent report',columns:['Name','Type','Count'],rows:rows.slice(0,3)});
window.analysisDemo = {v,second,ui,host,Layout};
