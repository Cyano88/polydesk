import test from 'node:test';
import assert from 'node:assert/strict';
import {revision,verifyVeilDeskRuntime} from './veildesk-runtime-version.mjs';
test('runtime guard accepts the shared immutable pin only with a clean checkout',()=>{
 const calls=[];
 assert.equal(verifyVeilDeskRuntime('/fixture',(_bin,args,options)=>{calls.push(args);assert.equal(options.cwd,'/fixture');return args[0]==='rev-parse'?revision+'\n':'';}),revision);
 assert.deepEqual(calls,[['rev-parse','HEAD'],['status','--porcelain']]);
});
test('runtime guard rejects the previous deployed pin and dirty content',()=>{
 assert.throws(()=>verifyVeilDeskRuntime('/fixture',()=> '2dd3c860cbcf6d93b9df5f30d952b3d2c962f58d\n'),/Unverified/);
 assert.throws(()=>verifyVeilDeskRuntime('/fixture',(_bin,args)=>args[0]==='rev-parse'?revision:' M scripts/provider-worker.mjs\n'),/Unverified/);
});
test('runtime guard propagates failed git inspection',()=>{
 assert.throws(()=>verifyVeilDeskRuntime('/fixture',()=>{throw Error('git unavailable')}),/git unavailable/);
});
