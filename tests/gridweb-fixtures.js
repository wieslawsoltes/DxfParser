/* Deterministic integration fixtures, generated with the real public format APIs. */
window.gridFixtures = {
  excel() {
    const book = new GridWeb.Workbook({name:'Equipment schedule'}), sheet = book.ActiveWorksheet;
    sheet.Name = 'Equipment';
    sheet.GetRange('A1:C4').Values = [['Tag','Quantity','Cost'],['P-101',2,1200],['V-201',3,800],['Total',null,null]];
    sheet.GetCell('C4').Formula = '=SUM(C2:C3)'; sheet.GetRange('A1:C1').SetStyle({font:{bold:true},fill:'#dceaf5'});
    sheet.GetRange('C2:C4').SetStyle({numberFormat:'#,##0.00'});sheet.FrozenRows=1;sheet.SetColumnWidth(0,180);
    const notes=book.Worksheets.Add('Notes');notes.GetCell('A1').Value='Drawing review';notes.GetRange('A1:C1').Merge();
    const bytes=GridWeb.exportXlsx(book);book.Dispose();return bytes;
  },
  async word() { return new Uint8Array(await RichTextWeb.toDOCX(RichTextWeb.fromHTML('<h1>Drawing review</h1><p><strong>Approved</strong> equipment schedule.</p><table><tr><td>Tag</td><td>Status</td></tr><tr><td>P-101</td><td>Reviewed</td></tr></table>'))); },
  legacyExcel(type='biff8') {
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Tag','Quantity'],['P-101',42]]),'Equipment');
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Second sheet']]),'Notes');
    return new Uint8Array(XLSX.write(book,{bookType:type,type:'array'}));
  },
  legacyWord(encrypted=false) {
    // Minimal Word 97 FIB + one Unicode PlcPcd piece in a real CFB file.
    const text='Legacy drawing review\rP-101 approved\r',word=new Uint8Array(4096),w=new DataView(word.buffer);
    w.setUint16(0,0xa5ec,true);w.setUint16(2,0xc1,true);w.setUint16(10,0x204|(encrypted?0x100:0),true);
    w.setUint16(32,14,true);w.setUint16(62,22,true);w.setUint32(76,text.length,true);w.setUint16(152,93,true);
    w.setUint32(154+33*8,0,true);w.setUint32(154+33*8+4,21,true);
    for(let i=0;i<text.length;i++)w.setUint16(1024+i*2,text.charCodeAt(i),true);
    const table=new Uint8Array(21),t=new DataView(table.buffer);table[0]=2;t.setUint32(1,16,true);t.setUint32(5,0,true);t.setUint32(9,text.length,true);t.setUint32(15,1024,true);
    const cfb=XLSX.CFB.utils.cfb_new();XLSX.CFB.utils.cfb_add(cfb,'WordDocument',word);XLSX.CFB.utils.cfb_add(cfb,'1Table',table);
    return new Uint8Array(XLSX.CFB.write(cfb,{type:'array'}));
  }
};
