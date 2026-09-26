import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, CommandHistory, CommandSession, createCommandConsole } from '../packages/dxf-command-line/index.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('parser normalizes names but preserves argument case and quoted spaces', () => {
    assert.deepEqual(parseCommand('  layer off "Main Pipes"  '), {text:'layer off "Main Pipes"',command:'LAYER',args:['off','Main Pipes']});
    assert.deepEqual(parseCommand("VIEW 'Sheet A'" ).args,['Sheet A']);
    assert.equal(parseCommand(' \t '),null);
});
test('parser retains Windows paths without escape interpretation', () => {
    assert.deepEqual(parseCommand(String.raw`OPEN "C:\Drawings\" '\\server\Share A\x.dxf'`).args, ['C:' + String.fromCharCode(92) + 'Drawings' + String.fromCharCode(92),String.raw`\\server\Share A\x.dxf`]);
});
test('parser handles Unicode, empty arguments and adjacent quoted segments', () => {
    assert.deepEqual(parseCommand('find "" \'\' Café" au lait" "Płyn"').args,['','','Café au lait','Płyn']);
    assert.deepEqual(parseCommand(`find 'a"b' "c'd"`).args,['a"b',"c'd"]);
});
test('parser rejects malformed single-line input before it can be executed', () => {
    for (const text of ['LAYOUT "Sheet','LAYOUT \'Sheet', '"" x', 'HELP\nREGEN', 'HELP\r', 'A\0B']) assert.throws(()=>parseCommand(text),SyntaxError);
    for (const value of [null,{},3]) assert.throws(()=>parseCommand(value),TypeError);
});
test('parser enforces exact command and argument budgets', () => {
    assert.equal(parseCommand('ABCD',{maxLength:4}).command,'ABCD');
    assert.throws(()=>parseCommand('ABCDE',{maxLength:4}),RangeError);
    assert.equal(parseCommand('A x y',{maxArguments:2}).args.length,2);
    assert.throws(()=>parseCommand('A x y z',{maxArguments:2}),RangeError);
    for (const bad of [0,-1,Infinity,NaN,1.2]) assert.throws(()=>parseCommand('A',{maxArguments:bad}),RangeError);
});
test('history is bounded, copies entries and restores the unsubmitted draft', () => {
    const history=new CommandHistory(2);history.push('A');history.push('B');history.push('C');
    assert.deepEqual(history.entries,['B','C']);history.entries.push('unsafe');
    assert.equal(history.previous('draft'),'C');assert.equal(history.previous(),'B');assert.equal(history.previous(),'B');
    assert.equal(history.next(),'C');assert.equal(history.next(),'draft');assert.equal(history.next(),'draft');
    assert.equal(history.entries.length,2);history.clear();assert.equal(history.index,0);
});
test('history does not erase a draft when Down precedes recall and resets on edits', () => {
    const history=new CommandHistory();assert.equal(history.next('draft'),'draft');assert.equal(history.previous('draft'),'draft');
    history.push('A');history.previous('draft');history.reset();assert.equal(history.previous('edited'),'A');assert.equal(history.next(),'edited');
    assert.throws(()=>new CommandHistory(0),RangeError);assert.throws(()=>history.push(2),TypeError);
});
test('session validates host contracts without running the executor', () => {
    assert.throws(()=>new CommandSession(),/execute/);
    assert.throws(()=>new CommandSession({execute(){},onObserverError:2}),TypeError);
    for(const option of ['maxPending','maxLength','maxArguments','historyLimit']) assert.throws(()=>new CommandSession({execute(){},[option]:0}),RangeError);
    assert.throws(()=>createCommandConsole(),/browser window/);
});
test('session executes strictly in submission order across async boundaries', async () => {
    const gate=deferred(), calls=[];
    const session=new CommandSession({execute:async ctx=>{calls.push(ctx.command);if(ctx.command==='A')await gate.promise;calls.push(ctx.command+' done');return ctx.args;}});
    const a=session.submit('A 1'),b=session.submit('B 2');await tick();assert.deepEqual(calls,['A']);
    gate.resolve();assert.deepEqual(await a,{status:'ok',value:['1']});assert.deepEqual(await b,{status:'ok',value:['2']});
    await tick();assert.deepEqual(calls,['A','A done','B','B done']);assert.equal(session.pending,0);session.dispose();
});
test('blank and malformed submissions do not enter execution or history', async () => {
    let calls=0;const session=new CommandSession({execute(){calls++;}});
    assert.equal((await session.submit('')).status,'empty');assert.equal((await session.submit('OPEN "')).status,'error');
    assert.equal(calls,0);assert.deepEqual(session.history.entries,[]);session.dispose();
});
test('capacity rejection precedes history mutation and includes the active command', async () => {
    const gate=deferred();const session=new CommandSession({maxPending:2,execute:()=>gate.promise});
    const a=session.submit('A'),b=session.submit('B');assert.equal((await session.submit('C')).status,'error');
    assert.equal(session.pending,2);assert.deepEqual(session.history.entries,['A','B']);gate.resolve();await a;await b;session.dispose();
});
test('executor exceptions are reported once and do not poison the queue', async () => {
    const output=[];const session=new CommandSession({execute:ctx=>{if(ctx.command==='FAIL')throw new Error('bad');return 42;}});
    session.subscribe(e=>{if(e.type==='output')output.push(e.message);});
    const a=session.submit('FAIL'),b=session.submit('OK');assert.equal((await a).status,'error');assert.equal((await b).value,42);
    assert.deepEqual(output,['bad']);session.dispose();
});
test('observer errors do not interrupt other subscribers or command execution', async () => {
    const errors=[],seen=[];const session=new CommandSession({execute:ctx=>ctx.write('done'),onObserverError:e=>{errors.push(e);throw e;}});
    session.subscribe(()=>{throw new Error('observer');});session.subscribe(e=>seen.push(e.type));
    assert.equal((await session.submit('A')).status,'ok');await tick();assert.ok(errors.length>=3);assert.ok(seen.includes('output'));session.dispose();
});
test('subscriptions use stable iteration and independent same-function tokens', async () => {
    const calls=[];const session=new CommandSession({execute(){}});let detachSecond;
    session.subscribe(e=>{if(e.type==='output'){calls.push('first');detachSecond();session.subscribe(()=>calls.push('new'));}});
    detachSecond=session.subscribe(()=>calls.push('removed'));session.write('x');assert.deepEqual(calls,['first']);
    const listener=()=>calls.push('same');const d1=session.subscribe(listener),d2=session.subscribe(listener);d1();assert.equal(d1(),false);
    session.write('y');assert.equal(calls.filter(x=>x==='same').length,1);d2();session.dispose();
});
test('disposal before execution cancels queued work without invoking the host', async () => {
    let calls=0;const session=new CommandSession({execute(){calls++;}});const a=session.submit('A'),b=session.submit('B');
    session.dispose();session.dispose();assert.equal((await a).status,'cancelled');assert.equal((await b).status,'cancelled');await tick();assert.equal(calls,0);
    assert.equal(session.pending,0);assert.deepEqual(session.history.entries,[]);assert.equal((await session.submit('C')).status,'cancelled');
    assert.throws(()=>session.subscribe(()=>{}),/disposed/);
});
test('disposal settles active callers immediately and suppresses late output/rejection', async () => {
    const gate=deferred(),output=[];let context;
    const session=new CommandSession({execute:async ctx=>{context=ctx;await gate.promise;ctx.write('late');}});
    session.subscribe(e=>{if(e.type==='output')output.push(e.message);});const a=session.submit('A');await tick();
    session.dispose();assert.equal((await a).status,'cancelled');assert.equal(context.signal.aborted,true);
    gate.reject(new Error('late rejection'));await tick();assert.deepEqual(output,[]);
});
test('disposal from the submission observer cannot orphan a queued caller', async () => {
    let calls=0;const session=new CommandSession({execute(){calls++;}});session.subscribe(e=>{if(e.type==='submitted')session.dispose();});
    assert.equal((await session.submit('A')).status,'cancelled');await tick();assert.equal(calls,0);
});
test('session data is immutable and no command string is evaluated as JavaScript', async () => {
    let command;const session=new CommandSession({execute:ctx=>{command=ctx;assert.ok(Object.isFrozen(ctx.args));assert.throws(()=>ctx.args.push('x'));}});
    assert.equal((await session.submit('alert(1)')).status,'ok');assert.equal(command.command,'ALERT(1)');assert.ok(Object.isFrozen(command));session.dispose();
});
test('sessions with identical commands keep independent queues and histories', async () => {
    const gate=deferred();const a=new CommandSession({execute:()=>gate.promise}),b=new CommandSession({execute:()=>2});
    const pending=a.submit('A');assert.equal((await b.submit('B')).value,2);a.dispose();assert.equal((await pending).status,'cancelled');
    assert.deepEqual(b.history.entries,['B']);b.dispose();gate.resolve();
});
