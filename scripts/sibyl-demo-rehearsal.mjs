// No-spend rehearsal: synthetic trade/provider fixtures, real SDK in isolated WSL storage.
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const run=(cmd,args,options={})=>spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,...options})
const created=run('wsl.exe',['-d','Ubuntu','--','mktemp','-d','/tmp/polydesk-demo-memory.XXXXXXXX'],{timeout:30000})
const root=created.stdout.trim()
if(created.status!==0||!/^\/tmp\/polydesk-demo-memory\.[A-Za-z0-9]+$/.test(root))throw Error('Isolated memory directory unavailable')
const python=process.env.POLYDESK_TEST_SIBYL_PYTHON||'/root/polydesk-buyer-candidate.hXrameVt/runtime/bin/python'
const files=['scripts/polymarket-memory-continuation.test.mjs','scripts/polymarket-local-memory.test.mjs','scripts/polymarket-execution-recovery.test.mjs','scripts/polymarket-execution-guard.test.mjs','scripts/paid-delivery-guidance.test.ts','scripts/smart-trader-delivery-status.test.ts','scripts/base-payment-lifecycle.test.ts','scripts/base-payment-recovery.test.ts']
const startedAt=new Date().toISOString()
const result=run(process.execPath,['--import','tsx','--test','--test-reporter=spec',...files],{env:{...process.env,NO_COLOR:'1',POLYDESK_TEST_REAL_SIBYL:'1',POLYDESK_LOCAL_MEMORY_ROOT:root,POLYDESK_LOCAL_MEMORY_PYTHON:python}})
const log=String(result.stdout||'')+String(result.stderr||'')
const count=name=>Number(log.match(new RegExp('(?:^|\\n).*?'+name+' (\\d+)(?:\\r?\\n|$)'))?.[1]||0)
const evidence=log.split(/\r?\n/).find(line=>line.startsWith('{"syntheticOnly":true'))
const realSdkEvidence=evidence?JSON.parse(evidence):null
const report={schema:'polydesk-sibyl-demo-rehearsal-v1',startedAt,finishedAt:new Date().toISOString(),commit:run('git',['rev-parse','HEAD']).stdout.trim(),workingTreeTestChanges:true,passed:result.status===0&&realSdkEvidence?.missingMemoryBlocks===true,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),realSdkEvidence,scope:'synthetic chain and provider evidence; real Sibyl SDK; isolated native memory; fresh Node processes',livePaymentMade:false,liveTradeSubmitted:false,productionMemoryTouched:false,hostedAcceptanceProven:false,testFiles:files}
mkdirSync('docs/demo',{recursive:true})
writeFileSync('docs/demo/sibyl-rehearsal-20260910.log',log)
writeFileSync('docs/demo/sibyl-rehearsal-20260910.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
if(!report.passed)process.exitCode=1
