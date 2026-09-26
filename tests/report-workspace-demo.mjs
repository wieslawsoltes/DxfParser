import { createAnalysisUI, createAnalysisDocking, createReportWorkspace } from '../packages/dxf-analysis/index.mjs';
const dockyard = window.AvalonDock;
const Layout = createAnalysisDocking({window,dockyard});
const ui = createAnalysisUI({window,treeDataGridCore:window.TreeDataGridCore,treeDataGridWeb:window.TreeDataGridWeb,gridWeb:window.GridWeb,
    createLayout: options => new Layout(options)});
const Results = createReportWorkspace({window,dockyard,createView:(container,options)=>new ui.AnalysisView(container,options)});
const closed=[],active=[];
const reports = new Results({container:document.getElementById('primary'),controls:document.getElementById('query'),
    onClose:entry=>closed.push(entry.id),onActiveChange:entry=>active.push(entry?.id)});
const first=reports.add({id:'result-a',title:'Equipment query',columns:['Tag','Type','Count'],rows:Array.from({length:40},(_,i)=>({key:i,values:['P-'+i,i%2?'Valve':'Pump',i+1]}))});
const second=reports.add({id:'result-b',title:'Revision query',columns:['Tag','Type','Count'],rows:[{key:'b',values:['V-201','Valve',4]}]});
reports.arrange('horizontal');reports.activate(first.id);
const other=new Results({container:document.getElementById('secondary'),controls:document.getElementById('other-query')});
other.add({title:'Independent report',columns:['Result'],rows:[{key:'other',values:['Independent']} ]});
window.reportDemo={reports,first,second,other,closed,active,Results,ui};
