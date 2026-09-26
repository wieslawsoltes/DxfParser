import { createCommandConsole } from '../packages/dxf-command-line/index.mjs';
const Console = createCommandConsole({window}), calls=[],errors=[];
const make = name => new Console({title:`${name} command history`,maxLines:8,maxOutputLength:120,
    execute:async context=>{
        calls.push([name,context.command,...context.args]);
        if(context.command==='FAIL')throw new Error('Host command failed');
        if(context.command==='WAIT')await new Promise(resolve=>setTimeout(resolve,120));
        context.signal.throwIfAborted();context.write(name+': '+context.args.join(' '));
        return name;
    },onError:message=>errors.push(message)});
const a=make('A'),b=make('B');document.getElementById('a').append(a.node);document.getElementById('b').append(b.node);
a.write('A ready');b.write('B ready');window.demo={Console,a,b,calls,errors,createCommandConsole};
