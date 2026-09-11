"""Unpaid operator verification. Never signs, pays, settles or starts research."""
import argparse, datetime, json, pathlib, urllib.request, urllib.error
p=argparse.ArgumentParser()
p.add_argument('--key-file',required=True)
p.add_argument('--isolation-key-file',required=True)
p.add_argument('--output',required=True)
a=p.parse_args()
key=pathlib.Path(a.key_file).read_text().strip()
other=pathlib.Path(a.isolation_key_file).read_text().strip()
base='https://polydesk.trade'
def call(method,path,body=None,credential=key,extra=None):
 headers={'Content-Type':'application/json'}
 if credential: headers['Authorization']='Bearer '+credential
 headers.update(extra or {})
 req=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(req,timeout=45) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:
  try: value=json.load(e)
  except Exception:value={}
  return e.code,value
body={'action':'ANALYZE','marketId':'0x'+'12'*32,'outcome':'Yes','side':'BUY'}
headers={'Idempotency-Key':'pd-unpaid-research-proof-20260911'}
path='/api/v1/research-jobs'
status,job=call('POST',path,body,extra=headers)
assert status==200, 'Reservation HTTP '+str(status)
assert job['status']=='AWAITING_PAYMENT' and job['transaction'] is None and job['result'] is None
assert job['fee']['amountAtomic']=='300000' and job['orderSubmitted'] is False
jid=job['jobId'];read_status,recovered=call('GET',path+'/'+jid)
assert read_status==200 and recovered['jobId']==jid
replay,repeat=call('POST',path,body,extra=headers)
assert replay==200 and repeat['jobId']==jid
conflict,_=call('POST',path,{**body,'outcome':'No'},extra=headers)
isolation,_=call('GET',path+'/'+jid,credential=other)
unauthorized,_=call('POST',path,body,credential=None,extra=headers)
unpaid_correction,_=call('POST',path+'/'+jid+'/correction',{'issue':'Synthetic unpaid test; must not be accepted'})
mismatch,_=call('POST','/api/x402/base/polymarket-smart-trader',{**body,'outcome':'No'},extra={'X-PolyDesk-Research-Job':jid})
assert (conflict,isolation,unauthorized,unpaid_correction,mismatch)==(409,404,401,409,409)
_,catalog=call('GET','/api/v1/capabilities',credential=None)
assert catalog['paidResearch']['fee']['amountAtomic']=='300000'
_,schema=call('GET','/api/v1/openapi.json',credential=None)
assert '/research-jobs/{id}/correction' in schema['paths']
proof={'evidenceClass':'operator_test_unpaid','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'jobId':jid,'status':job['status'],'reserved':status,'read':read_status,'replay':replay,'changedBody':conflict,'otherApplication':isolation,'missingAuth':unauthorized,'unpaidCorrection':unpaid_correction,'paymentRequestMismatch':mismatch,'amountAtomic':'300000','network':'Base','paymentAttempted':False,'researchStarted':False,'orderSubmitted':False,'market':'synthetic identifier; no market selected'}
pathlib.Path(a.output).write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
