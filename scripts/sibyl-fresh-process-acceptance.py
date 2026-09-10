"""Synthetic-only acceptance of real buyer/Sibyl decision logic in fresh processes."""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--buyer-source', required=True)
args = parser.parse_args()
source = Path(args.buyer_source).resolve()
assert (source / 'polydesk_memory.py').is_file()
child = r'''
import json, os, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import polydesk_memory as pm
import test_polydesk_memory as fixture
import sibyl_memory_client as sdk
from sibyl_memory_client.storage import db_size_bytes
root = Path(sys.argv[2])
mode = sys.argv[3]
assert sdk.__version__ == '0.8.0'
with patch('sibyl_memory_client._capcheck.aggregate_db_size', side_effect=lambda active: sum(db_size_bytes(p) for p in root.rglob('memory.db'))), patch('urllib.request.urlopen', side_effect=AssertionError('network prohibited')), patch('socket.socket.connect', side_effect=AssertionError('network prohibited')):
    store = pm.BuyerMemory(root / 'product-memory', fixture.OWNER)
    with store.flow_lock():
        if mode == 'capture':
            # Deliberately synthetic verifier output, never a claimed real fill.
            result = store._record_verified(pm.verified_projection(fixture.result(), fixture.IDENTIFIER))
        else:
            result = pm.execution_review(root / 'product-memory', fixture.OWNER, '123456789')
    print(json.dumps({'pid':os.getpid(), 'result':result}))
'''
with tempfile.TemporaryDirectory(prefix='polydesk-sibyl-fresh-') as directory:
    root = Path(directory)
    home = root / 'isolated-home'
    home.mkdir(mode=0o700)
    env = dict(os.environ, HOME=str(home), XDG_DATA_HOME=str(home / 'data'), XDG_CONFIG_HOME=str(home / 'config'))
    def run(mode):
        p = subprocess.run([sys.executable, '-I', '-B', '-c', child, str(source), str(root), mode], capture_output=True, text=True, timeout=30, env=env)
        if p.returncode: raise RuntimeError('Isolated child failed: ' + p.stderr[-1500:])
        return json.loads(p.stdout)
    before = run('review')
    capture = run('capture')
    after = run('review')
    assert len({before['pid'], capture['pid'], after['pid']}) == 3
    assert before['result']['nextAction'] == 'REQUIRE_FRESH_RESEARCH_AND_ACCOUNT_CHECKS'
    assert capture['result']['memoryWritePerformed'] is True
    assert after['result']['nextAction'] == 'REVIEW_EXISTING_TOKEN_FILLS'
    assert after['result']['historicalFillCount'] == 1
    for flag in ['signingAuthorized', 'paymentAuthorized', 'currentPositionVerified']:
        assert after['result'][flag] is False
    # Remove only this disposable test database by renaming it; demonstrate dependence.
    databases = list((root / 'product-memory').rglob('memory.db'))
    assert len(databases) == 1
    databases[0].rename(databases[0].with_name('memory.db.test-held'))
    without = run('review')
    assert without['result']['historicalFillCount'] == 0
    assert without['result']['nextAction'] != after['result']['nextAction']
    print(json.dumps({'ok':True, 'syntheticOnly':True, 'sdkVersion':'0.8.0', 'freshProcessCount':4,
        'before':before, 'capture':capture, 'after':after, 'withoutTestMemory':without,
        'productionMemoryTouched':False, 'paymentMade':False, 'orderSubmitted':False,
        'limitation':'Synthetic receipt fixture; real SDK and buyer decision code. Deleting test memory loses the prior-fill warning, but never grants trade authority. Not hosted buyer acceptance.'}, indent=2))
