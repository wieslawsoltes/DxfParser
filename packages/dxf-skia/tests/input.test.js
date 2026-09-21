'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('..'),H=require('./helpers');
function binary(pairs,{legacy=false,encoding='utf8'}={}) {
    const parts=[Buffer.from('AutoCAD Binary DXF\r\n\x1a\0','binary')];
    for(const [code,value] of pairs) {
        const c=Buffer.alloc(legacy?(code>=255?3:1):2);
        if(legacy&&code>=255){c[0]=255;c.writeUInt16LE(code,1);}else if(legacy)c[0]=code;else c.writeUInt16LE(code);
        parts.push(c);const kind=A.binaryGroupType(code);let b;
        if(kind==='double'){b=Buffer.alloc(8);b.writeDoubleLE(Number(value));}
        else if(kind==='int64'){b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(value));}
        else if(kind==='int32'){b=Buffer.alloc(4);b.writeInt32LE(Number(value));}
        else if(kind==='int16'){b=Buffer.alloc(2);b.writeInt16LE(Number(value));}
        else if(kind==='bool')b=Buffer.from([Number(value)]);
        else if(kind==='binary'){const data=Buffer.from(value,'hex');b=Buffer.concat([Buffer.from([data.length]),data]);}
        else b=Buffer.concat([Buffer.from(value,encoding),Buffer.from([0])]);
        parts.push(b);
    }
    return Buffer.concat(parts);
}
const pairs=entities=>[[0,'SECTION'],[2,'HEADER'],[9,'$ACADVER'],[1,'AC1021'],[0,'ENDSEC'],[0,'SECTION'],[2,'ENTITIES'],...entities,[0,'ENDSEC'],[0,'EOF']];
test('text scanner preserves empty values and exact mixed CR LF line locations',()=>{
 const source='\uFEFF 0\r\nTEXT\n1\r\n\n10\r+1.25e3\r0\nEOF';
 assert.deepEqual(A.parseTags(source),[{code:0,value:'TEXT',line:1},{code:1,value:'',line:3},{code:10,value:'+1.25e3',line:5},{code:0,value:'EOF',line:7}]);
 assert.deepEqual([...A.iterateTags(source)],A.parseTags(source));
});
test('scanner rejects truncated and invalid group lines with bounded allocations',()=>{
 for(const text of ['0','word\nvalue','1072\nx','1.1\nx'])assert.throws(()=>A.parseTags(text));
 assert.throws(()=>A.parseTags('0\nEOF',{maxTags:0}),RangeError);
 assert.throws(()=>A.parseTags('0\nLINE\n5\nA',{maxTags:1}),RangeError);
 assert.throws(()=>new A.DxfDocument('0\nEOF',{maxBytes:1}),RangeError);
});
test('document accepts renderer byte slices without reading backing-buffer padding',()=>{
 const text=H.file(H.line(),{header:[[9,'$ACADVER'],[1,'AC1021']]}),bytes=Buffer.concat([Buffer.from('junk'),Buffer.from(text),Buffer.from('more')]);
 const doc=new A.DxfDocument(bytes.subarray(4,bytes.length-4));assert.equal(doc.entities[0].type,'LINE');assert.equal(doc.inputEncoding,'utf-8');
 assert.equal(A.dxfText(bytes.subarray(4,bytes.length-4)),text);
});
test('declared UTF-8 preserves non-ASCII text and layer identity',()=>{
 const text=H.file([[0,'TEXT'],[8,'Ściana Ω'],[1,'Zażółć 世界'],[40,2]],{header:[[9,'$ACADVER'],[1,'AC1021'],[9,'$DWGCODEPAGE'],[3,'ANSI_1252']]});
 const doc=new A.DxfDocument(Buffer.from(text));assert.equal(doc.entities[0].get(1),'Zażółć 世界');assert.equal(doc.entities[0].layer,'Ściana Ω');
});
test('legacy ANSI_1250 and ANSI_1252 use declared codepages, not browser ascii alias',()=>{
 for(const [page,byte,expected] of [['ANSI_1250',0xa3,'Ł'],['ANSI_1252',0x80,'€']]){
  const text=H.file([[0,'TEXT'],[1,String.fromCharCode(byte)],[40,2]],{header:[[9,'$ACADVER'],[1,'AC1015'],[9,'$DWGCODEPAGE'],[3,page]]});
  assert.equal(new A.DxfDocument(Buffer.from(text,'latin1')).entities[0].get(1),expected);
 }
});
test('BOM UTF-8 and UTF-16 text input are explicitly decoded',()=>{
 const text=H.file([[0,'TEXT'],[1,'Ł Ω'],[40,2]]);
 assert.equal(new A.DxfDocument(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)])).entities[0].get(1),'Ł Ω');
 assert.equal(new A.DxfDocument(Buffer.from('\ufeff'+text,'utf16le')).entities[0].get(1),'Ł Ω');
});
test('invalid UTF-8 and unsupported codepage fail instead of silent mojibake',()=>{
 const text=H.file([[0,'TEXT'],[1,'\xff'],[40,2]],{header:[[9,'$ACADVER'],[1,'AC1021']]});
 assert.throws(()=>A.decodeDxf(Buffer.from(text,'latin1')),/Cannot decode/);
 assert.equal(new A.DxfDocument(Buffer.from(text,'latin1'),{encoding:'windows-1252'}).entities[0].get(1),'ÿ');
 const unknown=H.file([],{header:[[9,'$DWGCODEPAGE'],[3,'UNKNOWN']]});assert.throws(()=>A.decodeDxf(Buffer.from(unknown)),/Unsupported DXF codepage/);
 assert.throws(()=>A.decodeDxf(new Uint8Array(10),{maxInputBytes:5}),/budget/);
});
test('binary DXF round-trips ordered geometry tags and exact byte offsets',()=>{
 const input=binary(pairs([...H.circle('C'),...H.line('L')])),decoded=A.decodeDxf(input),doc=new A.DxfDocument(input);
 assert.equal(decoded.format,'binary');assert.equal(decoded.tags[0].offset,22);assert.equal(doc.entities.length,2);
 assert.equal(doc.entities[0].num(40),10);assert.ok(doc.entities[0].offset>22);
 assert.deepEqual(new A.SceneCompiler(doc).compile().bounds,new A.SceneCompiler(new A.DxfDocument(A.dxfText(input))).compile().bounds);
});
test('R12 single-byte group codes include escaped XDATA codes',()=>{
 const input=binary([[0,'SECTION'],[2,'ENTITIES'],...H.line('L'),[1001,'APP'],[1071,-123456],[1004,'00A1FF'],[0,'ENDSEC'],[0,'EOF']],{legacy:true});
 const decoded=A.decodeDxf(input);assert.equal(decoded.format,'binary-r12');assert.equal(decoded.tags.find(t=>t.code===1071).value,'-123456');assert.equal(decoded.tags.find(t=>t.code===1004).value,'00A1FF');
});
test('binary scalar widths preserve signed integers, booleans and int64 precision',()=>{
 const input=binary(pairs([...H.line(),[90,-2147483648],[160,'9223372036854775807'],[161,'-9223372036854775808'],[280,256],[290,1],[1004,'DEADBEEF']]));
 const e=new A.DxfDocument(input).entities[0];assert.equal(e.get(160),'9223372036854775807');assert.equal(e.get(161),'-9223372036854775808');assert.equal(e.num(280),256);assert.equal(e.num(90),-2147483648);assert.equal(e.num(290),1);
});
test('binary UTF-8 and legacy encoding are chosen from structural headers',()=>{
 assert.equal(new A.DxfDocument(binary(pairs([[0,'TEXT'],[1,'Ω 世界'],[40,2]]))).entities[0].get(1),'Ω 世界');
 const p=pairs([[0,'TEXT'],[1,'\x80'],[40,2]]);p[3][1]='AC1015';assert.equal(new A.DxfDocument(binary(p,{encoding:'latin1'})).entities[0].get(1),'€');
});
test('binary truncations at every offset reject without native calls',()=>{
 const input=binary(pairs(H.circle()));for(let i=22;i<input.length;i++)assert.throws(()=>A.decodeDxf(input.subarray(0,i)),undefined,'offset '+i);
 assert.throws(()=>A.decodeDxf(Buffer.from('AutoCAD Binary DXF\n')),/sentinel/);
});
test('binary malformed booleans, reserved groups and trailing bytes are explicit',()=>{
 assert.throws(()=>A.decodeDxf(binary(pairs([...H.line(),[290,2]]))),/boolean.*byte/);
 const invalid=Buffer.concat([Buffer.from('AutoCAD Binary DXF\r\n\x1a\0','binary'),Buffer.from([80,0,0])]);assert.throws(()=>A.decodeDxf(invalid),/group code 80.*byte/);
 assert.throws(()=>A.decodeDxf(Buffer.concat([binary(pairs(H.line())),Buffer.from([0])])),/Trailing/);
});
test('ordered binary chunks and duplicate handles are not collapsed by decoding',()=>{
 const e=new A.DxfDocument(binary(pairs([...H.line('F'),[310,'0001'],[310,'FEFF'],...H.circle('F')])));
 assert.deepEqual(e.entities[0].all(310),['0001','FEFF']);assert.notEqual(e.entities[0].id,e.entities[1].id);assert.ok(e.diagnostics.items.some(x=>x.code==='duplicate-handle'));
});
test('wide records use first-occurrence indexing and explicit invalidation',()=>{
 const r=new A.DxfRecord([{code:0,value:'X'},...Array.from({length:70},(_,i)=>({code:1,value:String(i)}))]);
 assert.equal(r.get(1),'0');assert.equal(r.all(1).length,70);r.tags[0].value='edited';r.invalidateTagIndex();assert.equal(r.get(1),'edited');
});
module.exports={binary,pairs};
