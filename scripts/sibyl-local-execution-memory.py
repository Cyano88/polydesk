"""Local finalized-fill projection, separate from governed server receipt memory."""
import argparse, fcntl, hashlib, json, os, re, runpy, stat, sys
from pathlib import Path
from contextlib import contextmanager

helpers = runpy.run_path(str(Path(__file__).with_name('sibyl-receipt-memory.py')))
private_directory = helpers['private_directory']
CATEGORY = 'polydesk_local_finalized_fill_v1'
def require(ok):
    if not ok: raise ValueError('Invalid local memory contract')
def valid_id(value):
    return isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9:_-]{8,100}', value)
def validate(body):
    require(set(body) == {'schema','provenance','owner','executionId','conditionId','tokenId','side','orderId','chainId','matchedSharesRaw','collateralRaw','feeRaw','fills','bindingHash','governedAuthorityVerified','signingAuthorized','paymentAuthorized','currentPositionVerified'})
    require(body['schema'] == 'polydesk-local-finalized-fill-v1' and body['provenance'] == 'LOCAL_BOUND_ORDER_AND_FINALIZED_CHAIN')
    require(re.fullmatch(r'0x[a-f0-9]{40}', body['owner']) and valid_id(body['executionId']))
    require(body['side'] in ('BUY','SELL') and body['chainId'] == 'eip155:137')
    for key in ('conditionId','orderId'): require(re.fullmatch(r'0x[a-f0-9]{64}', body[key]))
    require(re.fullmatch(r'[a-f0-9]{64}', body['bindingHash']))
    for key in ('tokenId','matchedSharesRaw','collateralRaw'): require(re.fullmatch(r'[1-9][0-9]{0,77}', body[key]))
    require(re.fullmatch(r'(0|[1-9][0-9]{0,77})', body['feeRaw']))
    for key in ('governedAuthorityVerified','signingAuthorized','paymentAuthorized','currentPositionVerified'): require(body[key] is False)
    require(isinstance(body['fills'], list) and 0 < len(body['fills']) <= 100)
    seen = set()
    for fill in body['fills']:
        require(set(fill) == {'transaction','blockNumber','blockHash'})
        for key in ('transaction','blockHash'): require(re.fullmatch(r'0x[a-f0-9]{64}', fill[key]))
        require(re.fullmatch(r'0x[0-9a-f]+', fill['blockNumber']) and fill['transaction'] not in seen)
        seen.add(fill['transaction'])

@contextmanager
def client_for(root, owner, capture):
    import sibyl_memory_client as sdk
    require(sdk.__version__ == '0.8.0')
    require(root.is_absolute() and not any(p in ('.codex','.agents','..') for p in root.parts))
    if capture: root.mkdir(parents=True, exist_ok=True, mode=0o700)
    private_directory(root)
    scope = hashlib.sha256(('polydesk-local-finalized-v1:' + owner).encode()).hexdigest()
    directory = root / scope
    if capture: directory.mkdir(exist_ok=True, mode=0o700)
    private_directory(directory)
    lock = directory / 'memory.lock'
    fd = os.open(lock, (os.O_CREAT | os.O_RDWR if capture else os.O_RDONLY) | os.O_NOFOLLOW, 0o600)
    try:
        m = os.fstat(fd)
        require(stat.S_ISREG(m.st_mode) and m.st_nlink == 1 and m.st_uid == os.geteuid() and not m.st_mode & 0o077)
        fcntl.flock(fd, (fcntl.LOCK_EX if capture else fcntl.LOCK_SH) | fcntl.LOCK_NB)
        db = directory / 'memory.db'
        if db.exists() or db.is_symlink():
            m = db.lstat()
            require(stat.S_ISREG(m.st_mode) and m.st_nlink == 1 and m.st_uid == os.geteuid() and not m.st_mode & 0o077)
        else: require(capture)
        storage = sdk.Storage(db)
        try: yield sdk.MemoryClient(storage, tenant_id=scope, tier='free', account_id=None, session_token=None), scope
        finally: storage.close()
    finally: os.close(fd)

def run(root, action, raw):
    body = json.loads(raw)
    if action == 'capture':
        validate(body)
        digest = hashlib.sha256(raw).hexdigest()
        envelope = {'payloadHash':digest,'receipt':body}
        with client_for(root, body['owner'], True) as (client, scope):
            import sibyl_memory_client as sdk
            try: row = client.get_entity(CATEGORY, body['executionId'])
            except sdk.NotFoundError: row = None
            if row is None: client.set_entity(CATEGORY, body['executionId'], envelope, status='local_finalized_fill')
            else: require(row['body'] == envelope and row['tenant_id'] == scope and row['status'] == 'local_finalized_fill')
        # Reopen after releasing the writer; do not claim persistence from a cached object.
        with client_for(root, body['owner'], False) as (client, scope):
            row = client.get_entity(CATEGORY, body['executionId'])
            require(row['body'] == envelope and row['tenant_id'] == scope and row['status'] == 'local_finalized_fill')
        return {'ok':True,'payloadHash':digest,'governedAuthorityVerified':False}
    require(set(body) == {'owner','records'} and re.fullmatch(r'0x[a-f0-9]{40}', body['owner']))
    require(isinstance(body['records'], list) and len(body['records']) <= 100)
    seen = set()
    for record in body['records']:
        require(set(record) == {'executionId','payloadHash'} and valid_id(record['executionId']) and re.fullmatch(r'[a-f0-9]{64}', record['payloadHash']))
        require(record['executionId'] not in seen)
        seen.add(record['executionId'])
    if not body['records']:
        import sibyl_memory_client as sdk
        require(sdk.__version__ == '0.8.0')
        return {'ok':True,'records':[],'historyComplete':False}
    results = []
    with client_for(root, body['owner'], False) as (client, scope):
        for record in body['records']:
            row = client.get_entity(CATEGORY, record['executionId'])
            require(row['tenant_id'] == scope and row['status'] == 'local_finalized_fill' and row['body']['payloadHash'] == record['payloadHash'])
            value = row['body']['receipt']
            validate(value)
            require(value['owner'] == body['owner'] and value['executionId'] == record['executionId'])
            results.append(value)
    return {'ok':True,'records':results,'historyComplete':False}

if __name__ == '__main__':
    os.umask(0o077)
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, required=True)
    p.add_argument('--action', choices=('capture','recall'), required=True)
    args = p.parse_args()
    try:
        raw = sys.stdin.buffer.read(131073)
        require(len(raw) <= 131072)
        print(json.dumps(run(args.root, args.action, raw)))
    except Exception:
        print(json.dumps({'ok':False,'state':'LOCAL_MEMORY_UNAVAILABLE','signingAuthorized':False}), file=sys.stderr)
        sys.exit(1)
