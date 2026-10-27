import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createVeilDeskPreviewRouter, veildeskPreviewRouter } from '../api/veildesk-preview.js'
import { createVeilDeskAdapter } from '../api/veildesk-client.js'

async function serve(router: ReturnType<typeof createVeilDeskPreviewRouter>) {
 const app=express();app.use(express.json());app.use('/previews',router)
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const url=`http://127.0.0.1:${(server.address() as any).port}/previews`
 return {url,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}}
}
const mandate=()=>({schema:'veildesk.mandate.v1' as const,id:randomUUID(),mode:'dry_run' as const,market:'integration-fixture',side:'YES' as const,maxSpendUsd:'1.00',limitPrice:'0.5',expiresAt:Date.now()+600000,approval:'preview_only' as const})
const auth=async(req:any)=>{const token=req.headers.authorization;if(token==='Bearer alice')return 'privy:alice';if(token==='Bearer bob')return 'privy:bob';throw Object.assign(Error('secret auth failure'),{status:401})}
const send=(url:string,user:string,body?:unknown)=>fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${user}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})

test('HTTP authentication, durable ownership, safe errors and replay',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'veildesk-api-')),jobs=new Map<string,any>();let submits=0
 const adapter={validatePreview:(m:any)=>{if(m.mode!=='dry_run')throw Error('bad')},submitPreview:async(m:any)=>{submits++;const old=jobs.get(m.id);if(old&&JSON.stringify(old)!==JSON.stringify(m))throw Error('Mandate ID reused with different contents');jobs.set(m.id,m)},getPreview:async(id:string)=>({id,state:'completed',executionAuthorized:false,mandate:jobs.get(id)}),submitPaymentHint:async()=>{throw Error('disabled')}}
 const deps={authenticate:auth,adapter:async()=>adapter,stateDirectory:dir}
 let server=await serve(createVeilDeskPreviewRouter(deps));const m=mandate()
 try{
  assert.equal((await send(server.url,'invalid',m)).status,401);assert.equal(submits,0)
  assert.equal((await send(server.url,'alice',{...m,mode:'live'})).status,400);assert.equal(submits,0)
  assert.equal((await send(server.url,'alice',m)).status,202)
  assert.equal((await send(server.url+'/'+m.id,'bob')).status,404)
  assert.equal((await send(server.url,'bob',m)).status,409);assert.equal(submits,1)
  assert.equal((await send(server.url,'alice',m)).status,202)
  assert.equal((await send(server.url,'alice',{...m,maxSpendUsd:'2.00'})).status,409)
  await server.close();server=await serve(createVeilDeskPreviewRouter(deps))
  const result=await send(server.url+'/'+m.id,'alice');assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual((await result.json()).mandate,m)
  assert.equal((await send(server.url+'/'+m.id,'bob')).status,404)
  assert.equal((await readFile(join(dir,'owners',m.id),'utf8')).includes('alice'),false)
 }finally{await server.close();await rm(dir,{recursive:true,force:true})}
})

test('production router rejects missing tokens before SDK initialization',async()=>{
 const server=await serve(veildeskPreviewRouter());try{assert.equal((await fetch(server.url+'/'+randomUUID())).status,401)}finally{await server.close()}
})

test('actual vendored SDK through authenticated HTTP boundary to live Render', {skip:!process.env.VEILDESK_LIVE_CONFIG}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'veildesk-live-http-'))
 const adapter=await createVeilDeskAdapter({configPath:resolve(process.env.VEILDESK_LIVE_CONFIG!),sdkRoot:resolve('vendor/veildesk'),stateDirectory:join(dir,'outbox')})
 const deps={authenticate:auth,adapter:async()=>adapter,stateDirectory:dir}
 let server=await serve(createVeilDeskPreviewRouter(deps));const m=mandate()
 try{
  assert.equal((await send(server.url,'alice',m)).status,202)
  let result:any
  for(let i=0;i<30;i++){const r=await send(server.url+'/'+m.id,'alice');assert.equal(r.status,200);result=await r.json();if(result.state==='completed')break;await new Promise(r=>setTimeout(r,2000))}
  assert.equal(result.state,'completed');assert.equal(result.result.payload.status,'validated');assert.deepEqual(result.result.payload.mandate,m);assert.equal(result.executionAuthorized,false)
  assert.equal((await send(server.url+'/'+m.id,'bob')).status,404)
  await server.close();server=await serve(createVeilDeskPreviewRouter(deps))
  assert.equal((await send(server.url,'alice',m)).status,202)
  assert.deepEqual((await (await send(server.url+'/'+m.id,'alice')).json()).result,result.result)
 }finally{await server.close();await rm(dir,{recursive:true,force:true})}
})

test('concurrent ownership and uncertain transport never transfer a mandate',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'veildesk-owners-'))
 let calls=0
 const adapter={validatePreview:()=>{},submitPreview:async()=>{calls++;throw Error('private-token-and-mandate-must-not-escape')},getPreview:async()=>{throw Error('private-token-and-mandate-must-not-escape')},submitPaymentHint:async()=>{}}
 const server=await serve(createVeilDeskPreviewRouter({authenticate:auth,adapter:async()=>adapter,stateDirectory:dir})),m=mandate()
 try{
  const results=await Promise.all([send(server.url,'alice',m),send(server.url,'bob',m)])
  assert.deepEqual(results.map(r=>r.status).sort(),[409,503]);assert.equal(calls,1)
  for(const r of results)assert.equal((await r.text()).includes('private-token'),false)
  const loser=results[0].status===409?'alice':'bob'
  assert.equal((await send(server.url+'/'+m.id,loser)).status,404)
  assert.equal((await send(server.url,loser,m)).status,409);assert.equal(calls,1)
 }finally{await server.close();await rm(dir,{recursive:true,force:true})}
})
