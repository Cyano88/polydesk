// Judge rehearsal: native Linux, real SDK, synthetic providers, no wallet/executor calls.
import {spawnSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..')
process.chdir(repo)
if(process.platform!=='linux')throw Error('Run inside Linux or a WSL Ubuntu shell; see docs/JUDGE_QUICKSTART.md')
if(Number(process.versions.node.split('.')[0])<20)throw Error('Node.js 20 or newer required')
const python=resolve('.sibyl-runtime/bin/python')
if(!existsSync(python))throw Error('Run sh scripts/build-sibyl-runtime.sh first')
const root=mkdtempSync(join(tmpdir(),'polydesk-judge-'));chmodSync(root,0o700)
const run=(command,args,options={})=>spawnSync(command,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,...options})
const files=['scripts/polymarket-memory-continuation.test.mjs','scripts/polymarket-local-memory.test.mjs','scripts/polymarket-execution-recovery.test.mjs','scripts/polymarket-execution-guard.test.mjs','scripts/paid-delivery-guidance.test.ts','scripts/smart-trader-delivery-status.test.ts','scripts/base-payment-lifecycle.test.ts','scripts/base-payment-recovery.test.ts']
const startedAt=new Date().toISOString()
const result=run(process.execPath,['--import','tsx','--test','--test-reporter=spec',...files],{env:{...process.env,NO_COLOR:'1',POLYDESK_TEST_REAL_SIBYL:'1',POLYDESK_LOCAL_MEMORY_ROOT:root,POLYDESK_LOCAL_MEMORY_PYTHON:python}})
const log=String(result.stdout||'')+String(result.stderr||'')
const count=name=>Number(log.match(new RegExp('(?:^|\\n).*?'+name+' (\\d+)(?:\\r?\\n|$)'))?.[1]||0)
const line=log.split(/\r?\n/).find(l=>l.startsWith('{"syntheticOnly":true'))
const evidence=line?JSON.parse(line):null
const pass=result.status===0&&count('tests')>0&&count('fail')===0&&count('skipped')===0&&evidence?.continuationPassed===true&&evidence?.missingMemoryBlocks===true&&evidence?.restoredMemoryRecalls===true
const report={schema:'polydesk-judge-reproduction-v1',startedAt,finishedAt:new Date().toISOString(),commit:run('git',['rev-parse','HEAD']).stdout.trim(),trackedChanges:run('git',['diff','--name-only','HEAD']).stdout.trim(),node:process.version,python:run(python,['--version']).stdout.trim(),pass,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),evidence,memoryRoot:root,syntheticOnly:true,liveTradeSubmitted:false,livePaymentMade:false,productionMemoryTouched:false}
mkdirSync('.judge-artifacts',{recursive:true})
writeFileSync('.judge-artifacts/result.json',JSON.stringify(report,null,2)+'\n')
writeFileSync('.judge-artifacts/tests.log',log)
console.log(JSON.stringify(report,null,2))
if(!pass){console.error(log);process.exitCode=1}
