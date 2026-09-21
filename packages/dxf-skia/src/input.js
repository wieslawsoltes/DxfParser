/* Byte-oriented DXF input. Binary integers are decoded without lossy Number
 * conversion; original offsets and ordered/repeated group tags are retained.
 * TextDecoder support determines legacy codepages; unsupported pages fail closed. */
(function(root) {
    'use strict';
    const A=root.DxfSkia;
    const SENTINEL='AutoCAD Binary DXF\r\n\x1a\0';
    const between=(code,a,b)=>code>=a&&code<=b;
    function binaryGroupType(code) {
        if(between(code,310,319)||code===1004)return 'binary';
        if(between(code,290,299))return 'bool';
        if(between(code,60,79)||between(code,170,179)||between(code,270,289)||between(code,370,389)||between(code,400,409)||between(code,1060,1070))return 'int16';
        if(between(code,90,99)||between(code,420,429)||between(code,440,459)||code===1071)return 'int32';
        if(between(code,160,169))return 'int64';
        if(between(code,10,59)||between(code,110,149)||between(code,210,239)||between(code,460,469)||between(code,1010,1059))return 'double';
        if(between(code,0,9)||between(code,100,102)||code===105||between(code,300,309)||between(code,320,369)||between(code,390,399)||between(code,410,419)||between(code,430,439)||between(code,470,481)||code===999||between(code,1000,1009))return 'string';
        throw new RangeError('Unsupported binary DXF group code '+code+'.');
    }
    function encodingName(version,codepage,override) {
        if(override)return override;
        if(/^AC\d{4}$/.test(version||'')&&Number(version.slice(2))>=1021)return 'utf-8';
        const page=String(codepage||'ANSI_1252').trim().toUpperCase();
        const mapping={ANSI_932:'shift_jis',ANSI_936:'gbk',ANSI_949:'euc-kr',ANSI_950:'big5',ANSI_874:'windows-874',UTF8:'utf-8','UTF-8':'utf-8',ANSI_65001:'utf-8',DOS437:'ibm437',DOS850:'ibm850'};
        if(/^ANSI_125[0-8]$/.test(page))return 'windows-'+page.slice(5);
        if(mapping[page])return mapping[page];
        throw new RangeError('Unsupported DXF codepage '+page+'; supply an explicit encoding/decoder.');
    }
    function decoder(name,options) {
        if(options.decodeString) return {decode:bytes=>String(options.decodeString(bytes,name))};
        try {
            const native = new TextDecoder(name,{fatal:options.fatalEncoding!==false});
            // Node/ICU builds may expose Latin-1 controls for this WHATWG alias.
            // Normalize only the Windows-1252 C1 window; already-decoded Unicode
            // remains untouched and undefined bytes retain their control values.
            if (native.encoding === 'windows-1252') {
                const high=[0x20ac,0x81,0x201a,0x192,0x201e,0x2026,0x2020,0x2021,0x2c6,0x2030,0x160,0x2039,0x152,0x8d,0x17d,0x8f,0x90,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x2dc,0x2122,0x161,0x203a,0x153,0x9d,0x17e,0x178];
                return {decode:bytes=>native.decode(bytes).replace(/[\u0080-\u009f]/g,ch=>String.fromCodePoint(high[ch.charCodeAt(0)-128]))};
            }
            return native;
        }
        catch {throw new RangeError('TextDecoder cannot decode DXF encoding '+name+'; supply decodeString.');}
    }
    function metadata(tags) {
        let version='',codepage='',section='',variable='';
        for(const tag of tags) {
            const value=tag.value;
            if(tag.code===0) {if(value==='ENDSEC'&&section==='HEADER')break;if(value==='SECTION')section='?';variable='';}
            else if(tag.code===2&&section==='?')section=value.trim();
            else if(section==='HEADER'&&tag.code===9)variable=value.trim();
            else if(section==='HEADER'&&variable==='$ACADVER'&&tag.code===1)version=value.trim();
            else if(section==='HEADER'&&variable==='$DWGCODEPAGE'&&tag.code===3)codepage=value.trim();
        }
        return {version,codepage};
    }
    // Sniff only structural ASCII header fields without allocating every line or
    // decoding the entire file twice. Other records are traversed by byte offsets.
    function byteHeader(bytes) {
        const ascii=new TextDecoder('windows-1252');let i=0,section='',variable='',version='',codepage='';
        const line=()=>{const start=i;while(i<bytes.length&&bytes[i]!==10&&bytes[i]!==13)i++;const end=i;if(i<bytes.length){const cr=bytes[i++]===13;if(cr&&bytes[i]===10)i++;}return bytes.subarray(start,end);};
        while(i<bytes.length) {
            const codeLine=line();let code=0,valid=false;
            for(const b of codeLine){if(b===32||b===9)continue;if(b<48||b>57){valid=false;break;}code=code*10+b-48;valid=true;}
            if(!valid)continue;
            const value=line();
            if(code===0) {
                const str=ascii.decode(value).trim();
                if(str==='ENDSEC'&&section==='HEADER')break;
                section=str==='SECTION'?'?':str==='ENDSEC'?'':section;variable='';
                if(str==='EOF')break;
            } else if(code===2&&section==='?')section=ascii.decode(value).trim();
            else if(section==='HEADER') {
                if(code===9)variable=ascii.decode(value).trim();
                else if(variable==='$ACADVER'&&code===1)version=ascii.decode(value).trim();
                else if(variable==='$DWGCODEPAGE'&&code===3)codepage=ascii.decode(value).trim();
            }
        }
        return {version,codepage};
    }
    function decodeDxf(input,options={}) {
        const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
        if(!bytes)throw new TypeError('DXF input requires an ArrayBuffer or byte view.');
        const maxInputBytes=options.maxInputBytes??128*1024*1024,maxTags=options.maxTags??4000000;
        if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1||!Number.isSafeInteger(maxTags)||maxTags<1)throw new RangeError('Positive integer input/tag budgets required.');
        if(bytes.length>maxInputBytes)throw new RangeError('DXF byte budget exceeded.');
        const binary=bytes.length>=SENTINEL.length&&Array.from(SENTINEL,(c,i)=>bytes[i]===c.charCodeAt(0)).every(Boolean);
        if(!binary) {
            if(bytes.length>=18&&new TextDecoder('ascii').decode(bytes.subarray(0,18)).startsWith('AutoCAD Binary DXF'))throw new SyntaxError('Invalid binary DXF sentinel.');
            let bom='';
            if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)bom='utf-8';
            if(bytes[0]===0xff&&bytes[1]===0xfe)bom='utf-16le';
            if(bytes[0]===0xfe&&bytes[1]===0xff)bom='utf-16be';
            const info=bom?{}:byteHeader(bytes),encoding=encodingName(info.version,info.codepage,options.encoding||bom);
            let text;try{text=decoder(encoding,options).decode(bytes);}catch(error){throw new SyntaxError('Cannot decode DXF '+encoding+': '+error.message);}
            return {format:'text',encoding,version:info.version||'',text,byteLength:bytes.length};
        }
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tags=[],strings=[],ascii=new TextDecoder('windows-1252');let i=22;
        const need=n=>{if(i+n>bytes.length)throw new SyntaxError('Truncated binary DXF at byte '+i+'.');};
        need(2);const legacy=bytes[22]===0&&bytes[23]!==0;
        while(i<bytes.length) {
            const offset=i;let code;
            if(legacy){need(1);code=bytes[i++];if(code===255){need(2);code=view.getUint16(i,true);i+=2;}}
            else {need(2);code=view.getUint16(i,true);i+=2;}
            let type;try{type=binaryGroupType(code);}catch(error){throw new SyntaxError(error.message+' At byte '+offset+'.');}
            let value;
            if(type==='binary'){need(1);const count=bytes[i++];need(count);value='';for(const b of bytes.subarray(i,i+count))value+=b.toString(16).padStart(2,'0');i+=count;value=value.toUpperCase();}
            else if(type==='bool'){need(1);value=bytes[i++];if(value>1)throw new SyntaxError('Invalid DXF boolean at byte '+offset+'.');}
            else if(type==='int16'){need(2);value=view.getInt16(i,true);i+=2;}
            else if(type==='int32'){need(4);value=view.getInt32(i,true);i+=4;}
            else if(type==='int64'){need(8);value=view.getBigInt64(i,true).toString();i+=8;}
            else if(type==='double'){need(8);value=view.getFloat64(i,true);i+=8;if(!Number.isFinite(value))throw new SyntaxError('Nonfinite binary DXF number at byte '+offset+'.');}
            else {const start=i,end=bytes.indexOf(0,i);if(end<0)throw new SyntaxError('Unterminated binary DXF string at byte '+i+'.');i=end+1;value=ascii.decode(bytes.subarray(start,end));strings.push({index:tags.length,start,end});}
            tags.push({code,value:String(value),line:tags.length*2+1,offset});
            if(tags.length>maxTags)throw new RangeError('DXF tag budget exceeded.');
            if(code===0&&value==='EOF'){if(i!==bytes.length)throw new SyntaxError('Trailing binary DXF data at byte '+i+'.');break;}
        }
        if(!tags.length||tags[0].code!==0||!['SECTION','EOF'].includes(tags[0].value)||tags.at(-1).code!==0||tags.at(-1).value!=='EOF')throw new SyntaxError('Binary DXF has no valid section/EOF framing.');
        const info=metadata(tags),encoding=encodingName(info.version,info.codepage,options.encoding),textDecoder=decoder(encoding,options);
        for(const span of strings) {try{tags[span.index].value=textDecoder.decode(bytes.subarray(span.start,span.end));}catch(error){throw new SyntaxError('Cannot decode binary DXF string at byte '+span.start+': '+error.message);}}
        return {format:legacy?'binary-r12':'binary',encoding,version:info.version,tags,byteLength:bytes.length};
    }
    function dxfText(input,options={}) {
        if(typeof input==='string')return input;
        const decoded=decodeDxf(input,options);
        if(decoded.text!==undefined)return decoded.text;
        return decoded.tags.map(t=>{if(/[\r\n]/.test(t.value))throw new SyntaxError('Embedded newline in binary string cannot be represented in a line-based tree; use DxfDocument byte input.');return t.code+'\n'+t.value+'\n';}).join('');
    }
    Object.assign(A,{decodeDxf,dxfText,binaryGroupType});
    if(typeof module==='object'&&module.exports)module.exports=A;
})(globalThis);
