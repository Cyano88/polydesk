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


def trusted_render_mount(path, metadata):
    # Render owns the mounted volume root; only its service group may write it.
    # This exception never applies to owner directories or arbitrary ancestors.
    if (path != Path('/var/sibyl') or metadata.st_uid != 0
            or metadata.st_gid != os.getegid() or metadata.st_mode & 0o002):
        return False
    mounts = Path('/proc/self/mountinfo').read_text()
    return any(len(parts := line.split()) > 4 and parts[4] == '/var/sibyl'
               for line in mounts.splitlines())


def private_directory(path):
    require(path.is_absolute() and '..' not in path.parts)
    for parent in (path, *path.parents):
        metadata = parent.lstat()
        require(stat.S_ISDIR(metadata.st_mode))
        require(not metadata.st_mode & 0o022 or bool(metadata.st_mode & stat.S_ISVTX)
                or trusted_render_mount(parent, metadata))
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


def recall(root, payload):
    """Read existing projections only; never repair a missing store or entity."""
    import sibyl_memory_client as sdk
    require(sdk.__version__ == '0.8.0' and len(payload) <= 32768)
    request = json.loads(payload)
    require(set(request) == {'owner', 'records'})
    owner, records = request['owner'], request['records']
    require(isinstance(owner, str) and re.fullmatch(r'0x[a-f0-9]{40}', owner))
    require(isinstance(records, list) and len(records) <= 100)
    identifiers = set()
    for record in records:
        require(set(record) == {'executionId', 'payloadHash'})
        require(re.fullmatch(r'pex_[a-f0-9]{24}', record['executionId']))
        require(re.fullmatch(r'[a-f0-9]{64}', record['payloadHash']))
        require(record['executionId'] not in identifiers)
        identifiers.add(record['executionId'])
    private_directory(root)
    result = []
    if records:
        scope = hashlib.sha256(('polydesk-buyer-v1:' + owner).encode()).hexdigest()
        directory = root / scope
        private_directory(directory)
        fd = os.open(directory / 'delivery.lock', os.O_RDONLY | os.O_NOFOLLOW)
        try:
            metadata = os.fstat(fd)
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
                    and metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077)
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            database = directory / 'memory.db'
            metadata = database.lstat()
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
                    and metadata.st_uid == os.geteuid() and not metadata.st_mode & 0o077)
            storage = sdk.Storage(database)
            try:
                client = sdk.MemoryClient(storage, tenant_id=scope, tier='free', account_id=None, session_token=None)
                for record in records:
                    row = client.get_entity(CATEGORY, record['executionId'])
                    value = row['body']
                    require(row['tenant_id'] == scope and row['status'] == 'server_verified_fill')
                    require(value['schema'] == 'polydesk-postgres-projection-v1'
                            and value['payloadHash'] == record['payloadHash'])
                    require(value['receipt']['owner'] == owner
                            and value['receipt']['executionId'] == record['executionId'])
                    result.append(value)
            finally:
                storage.close()
        finally:
            os.close(fd)
    return {'ok': True, 'state': 'SIBYL_RECALLED', 'owner': owner, 'records': result}


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--recall', action='store_true')
    args = parser.parse_args()
    try:
        action = recall if args.recall else capture
        print(json.dumps(action(args.root, sys.stdin.buffer.read(32769 if args.recall else 16385))))
    except Exception:
        print(json.dumps({'ok': False, 'state': 'SIBYL_DELIVERY_UNAVAILABLE'}), file=sys.stderr)
        raise SystemExit(1)
