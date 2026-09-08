"""Private single-owner-at-a-time Sibyl projection worker. No network or wallet calls."""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys

CATEGORY = 'polydesk_verified_receipt_v1'


def require(value):
    if not value:
        raise ValueError('Invalid memory projection or storage')


def private_directory(path):
    require(path.is_absolute() and '..' not in path.parts)
    for parent in (path, *path.parents):
        metadata = parent.lstat()
        require(stat.S_ISDIR(metadata.st_mode))
        require(not metadata.st_mode & 0o022 or bool(metadata.st_mode & stat.S_ISVTX))
    metadata = path.stat()
    require(metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077)


def capture(root, payload):
    import sibyl_memory_client as sdk
    require(sdk.__version__ == '0.8.0')
    require(len(payload) <= 16384)
    body = json.loads(payload)
    base = {'schema','owner','executionId','verifiedAt','tokenId','orderId','transactionHash',
            'fillSize','fillPrice','fillAmountUsdc','chainId','blockHash','finalizedBlockHash','researchPolicy'}
    policy = body.get('researchPolicy')
    require(policy in ('agent-independent-v1','zeroscout-approved-v1'))
    fields = base | ({'researchDecisionId','researchAnalysisHash'} if policy == 'zeroscout-approved-v1' else set())
    require(set(body) == fields and body['schema'] == 'polydesk-receipt-memory-v1')
    require(re.fullmatch(r'0x[a-f0-9]{40}', body['owner']))
    require(re.fullmatch(r'pex_[a-f0-9]{24}', body['executionId']))
    require(body['chainId'] == 'eip155:137')
    require(re.fullmatch(r'[1-9][0-9]{0,77}', body['tokenId']))
    for key in ('orderId','transactionHash','blockHash','finalizedBlockHash'):
        require(re.fullmatch(r'0x[a-fA-F0-9]{64}', body[key]))
    for key in ('fillSize','fillPrice','fillAmountUsdc'):
        require(type(body[key]) in (int,float) and math.isfinite(body[key]) and body[key] > 0)
    require(body['fillPrice'] <= 1)
    if policy == 'zeroscout-approved-v1':
        require(re.fullmatch(r'pstd_[a-f0-9]{32}', body['researchDecisionId']))
        require(re.fullmatch(r'[a-f0-9]{64}', body['researchAnalysisHash']))
    digest = hashlib.sha256(payload).hexdigest()
    private_directory(root)
    scope = hashlib.sha256(('polydesk-buyer-v1:' + body['owner']).encode()).hexdigest()
    directory = root / scope
    directory.mkdir(mode=0o700, exist_ok=True)
    private_directory(directory)
    lock = directory / 'delivery.lock'
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        metadata = os.fstat(fd)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
                and metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077)
        # OS-released lock survives process crashes without stale-lock deletion.
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        database = directory / 'memory.db'
        if database.exists() or database.is_symlink():
            metadata = database.lstat()
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
                    and metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077)
        storage = sdk.Storage(database)
        try:
            client = sdk.MemoryClient(storage, tenant_id=scope, tier='free', account_id=None, session_token=None)
            expected = {'schema': 'polydesk-postgres-projection-v1', 'payloadHash': digest, 'receipt': body}
            try:
                existing = client.get_entity(CATEGORY, body['executionId'])
            except sdk.NotFoundError:
                existing = None
            if existing is not None:
                require(existing['body'] == expected and existing['tenant_id'] == scope
                        and existing['status'] == 'server_verified_fill')
            else:
                client.set_entity(CATEGORY, body['executionId'], expected, status='server_verified_fill')
        finally:
            storage.close()
        # Fresh connection proves durable readback, not just in-memory success.
        storage = sdk.Storage(database)
        try:
            client = sdk.MemoryClient(storage, tenant_id=scope, tier='free', account_id=None, session_token=None)
            row = client.get_entity(CATEGORY, body['executionId'])
            require(row['body'] == expected and row['tenant_id'] == scope and row['status'] == 'server_verified_fill')
        finally:
            storage.close()
    finally:
        os.close(fd)
    return {'ok': True, 'state': 'SIBYL_CAPTURED_AND_RECALLED', 'owner': body['owner'],
            'executionId': body['executionId'], 'payloadHash': digest}


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(capture(args.root, sys.stdin.buffer.read(16385))))
    except Exception:
        print(json.dumps({'ok': False, 'state': 'SIBYL_DELIVERY_UNAVAILABLE'}), file=sys.stderr)
        raise SystemExit(1)
