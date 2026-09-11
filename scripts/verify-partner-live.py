"""Authorized operator test: free discovery only; credentials never printed."""
import argparse, concurrent.futures, datetime, hashlib, json, pathlib, urllib.request, urllib.error, uuid
p=argparse.ArgumentParser()
p.add_argument('phase',choices=['create','recover'])
p.add_argument('--key-file',required=True)
p.add_argument('--isolation-key-file',required=True)
p.add_argument('--state-file',required=True)
a=p.parse_args()
key=pathlib.Path(a.key_file).read_text().strip()
other=pathlib.Path(a.isolation_key_file).read_text().strip()
base='https://polydesk.trade/api/v1'
statefile=pathlib.Path(a.state_file)
def call(method,path,body=None,credential=key,idem=None):
 headers={'Content-Type':'application/json'}
 if credential: headers['Authorization']='Bearer '+credential
 if idem: headers['Idempotency-Key']=idem
 req=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
 try:
  r=urllib.request.urlopen(req,timeout=50); return r.status,json.load(r)
 except urllib.error.HTTPError as e:
  try: result=json.load(e)
  except Exception: result={}
  return e.code,result

def fingerprint(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def check(condition,message):
 if not condition: raise SystemExit(message)

if a.phase=='create':
 state={'evidenceClass':'operator_test','partner':'PolyDesk integration test','idempotencyKey':'pd-live-proof-'+str(uuid.uuid4()),'request':{'capability':'market-discovery','input':{'q':'Manchester United','intent':'Review listed Manchester United markets without selecting or trading'}},'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 # Save the retry identity before the remote call; ambiguous requests must reuse it.
 if statefile.exists(): state=json.loads(statefile.read_text())
 statefile.write_text(json.dumps(state,indent=2))
 code,job=call('POST','/jobs',state['request'],idem=state['idempotencyKey'])
 check(code in [200,202],'Creation returned HTTP '+str(code)+'. Preserve the state file and retry with its original key.')
 state.update({'jobId':job['jobId'],'initialStatus':job['status']})
 statefile.write_text(json.dumps(state,indent=2))
 check(job['status']=='COMPLETED','Job stored but not completed; reconcile the original job before verification.')
 check(job['payment']['required'] is False and job['orderSubmitted'] is False,'Unexpected financial behavior')
 state.update({'resultHash':fingerprint(job['result']),'jobCreatedAt':job['createdAt'],'attempts':job['attempts'],'candidateCount':len(job['result']['candidates'])})
 statefile.write_text(json.dumps(state,indent=2))
 print(json.dumps({'ok':True,'phase':'create','jobId':job['jobId'],'status':job['status'],'attempts':job['attempts'],'candidateCount':state['candidateCount'],'evidenceClass':'operator_test'}))
else:
 state=json.loads(statefile.read_text())
 check('resultHash' in state,'Initial proof incomplete; reconcile saved operation before comparing results.')
 code,job=call('GET','/jobs/'+state['jobId'])
 check(code==200 and job['status']=='COMPLETED','Saved job was not recovered')
 check(fingerprint(job['result'])==state['resultHash'],'Saved result changed')
 check(job['attempts']==state['attempts'] and job['createdAt']==state['jobCreatedAt'],'Original job identity or attempts changed')
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  repeats=list(pool.map(lambda _:call('POST','/jobs',state['request'],idem=state['idempotencyKey']),range(3)))
 check(all(c==200 and j['jobId']==state['jobId'] and j['attempts']==state['attempts'] and fingerprint(j['result'])==state['resultHash'] for c,j in repeats),'Concurrent replay changed job or result')
 conflict,_=call('POST','/jobs',{'capability':'market-discovery','input':{'q':'different request'}},idem=state['idempotencyKey'])
 isolation,_=call('GET','/jobs/'+state['jobId'],credential=other)
 unauthorized,_=call('GET','/jobs/'+state['jobId'],credential='')
 resumed,j=call('POST','/jobs/'+state['jobId']+'/resume',{})
 check(conflict==409 and isolation==404 and unauthorized==401,'Isolation or conflict control failed')
 check(resumed==200 and j['attempts']==state['attempts'] and fingerprint(j['result'])==state['resultHash'],'Completed-job resume reran work')
 proof={'ok':True,'phase':'fresh-client-recovery','jobId':state['jobId'],'resultHash':state['resultHash'],'attempts':j['attempts'],'concurrentReplayCount':3,'changedInputStatus':conflict,'crossApplicationStatus':isolation,'missingCredentialStatus':unauthorized,'completedResumeStatus':resumed,'evidenceClass':'operator_test','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 state['verification']=proof;statefile.write_text(json.dumps(state,indent=2))
 print(json.dumps(proof))
