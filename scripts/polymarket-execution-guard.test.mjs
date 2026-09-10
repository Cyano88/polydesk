import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {claimExecution,recordSubmission,runGuard,executionStatus} from './polymarket-execution-guard.mjs'
const order='0x'+'12'.repeat(32)
function fixture(t){const d=mkdtempSync(join(tmpdir(),'polydesk-guard-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d}
test('crash after durable claim blocks same and different IDs across restart',t=>{
 const d=fixture(t);claimExecution(d,'buyer:order:001',['sell'])
 assert.equal(executionStatus(d).state,'PENDING')
 assert.throws(()=>claimExecution(d,'buyer:order:001',['sell']),/already recorded/)
 assert.throws(()=>claimExecution(d,'buyer:order:002',['buy']),/pending or uncertain/)
})
test('confirmed submission records order and permanently blocks duplicate ID',t=>{
 const d=fixture(t);recordSubmission(claimExecution(d,'buyer:order:001',['sell']),order)
 assert.equal(executionStatus(d).state,'NO_UNCERTAIN_EXECUTION')
 assert.throws(()=>claimExecution(d,'buyer:order:001',['sell']),/already recorded/)
 assert.equal(claimExecution(d,'buyer:order:002',['buy']).state.state,'PENDING')
})
test('timeout, process kill and ambiguous output retain guard and never rerun',t=>{
 for(const result of [{status:1},{status:null,signal:'SIGKILL'},{status:0,stdout:'{}'},{status:0,stdout:JSON.stringify({ok:true,data:{order_id:'bad'}})}]){
  const d=fixture(t);let calls=0
  assert.throws(()=>runGuard(d,'buyer:order:001','fake',[],()=>{calls++;return result}))
  assert.throws(()=>runGuard(d,'buyer:order:001','fake',[],()=>{calls++;return result}))
  assert.equal(calls,1);assert.equal(executionStatus(d).state,'PENDING')
 }
})
test('two independent processes cannot both claim submission',async t=>{
 const d=fixture(t)
 const script=`import {claimExecution} from './scripts/polymarket-execution-guard.mjs';try{claimExecution(process.argv[1],process.argv[2],['buy'])}catch{process.exitCode=1}`
 const run=id=>new Promise(resolve=>{const child=spawn(process.execPath,['--input-type=module','-e',script,d,id],{stdio:'ignore'});child.on('exit',resolve)})
 const codes=await Promise.all([run('buyer:order:001'),run('buyer:order:002')])
 assert.deepEqual(codes.sort(),[0,1])
})
test('guard injects an exact portable pre-submit binding path into WSL',t=>{
 const d=fixture(t);let childArgs
 assert.throws(()=>runGuard(d,'buyer:order:001','wsl.exe',['--exec','env','OTHER=1','binary','buy'],(_command,args)=>{childArgs=args;return {status:1}}))
 const path=childArgs.find(value=>value.startsWith('POLYDESK_RECOVERY_BINDING_PATH='))
 assert.ok(path.endsWith('.json.binding.json'))
 assert.ok(!path.includes('\\'))
 assert.ok(childArgs.includes('POLYDESK_EXECUTION_ID=buyer:order:001'))
})
test('native pretty-printed success records once and blocks duplicate execution',t=>{
 const d=fixture(t);let calls=0
 const result=runGuard(d,'buyer:pretty:001','fake',[],()=>{calls++;return {status:0,stdout:JSON.stringify({ok:true,data:{order_id:order}},null,2)}})
 assert.equal(result.state,'SUBMITTED');assert.equal(result.orderId,order)
 assert.equal(executionStatus(d).state,'NO_UNCERTAIN_EXECUTION');assert.equal(calls,1)
 assert.throws(()=>claimExecution(d,'buyer:pretty:001',['fake']),/already recorded/)
})
