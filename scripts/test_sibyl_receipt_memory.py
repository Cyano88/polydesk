import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

bridge = runpy.run_path(str(Path(__file__).with_name('sibyl-receipt-memory.py')))


class ReceiptMemoryTests(unittest.TestCase):
    def test_render_mount_exception_is_exact_and_group_scoped(self):
        meta = SimpleNamespace(st_uid=0, st_gid=os.getegid(), st_mode=0o42775)
        with patch.object(Path, 'read_text', return_value='1 2 0:1 / /var/sibyl rw - ext4 disk rw'):
            self.assertTrue(bridge['trusted_render_mount'](Path('/var/sibyl'), meta))
            self.assertFalse(bridge['trusted_render_mount'](Path('/var/other'), meta))
            meta.st_gid += 1
            self.assertFalse(bridge['trusted_render_mount'](Path('/var/sibyl'), meta))
            meta.st_gid = os.getegid()
            meta.st_mode = 0o42777
            self.assertFalse(bridge['trusted_render_mount'](Path('/var/sibyl'), meta))
        meta.st_mode = 0o42775
        with patch.object(Path, 'read_text', return_value='1 2 0:1 / /var/other rw - ext4 disk rw'):
            self.assertFalse(bridge['trusted_render_mount'](Path('/var/sibyl'), meta))

    def setUp(self):
        self.previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.previous_umask)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.body = {'schema':'polydesk-receipt-memory-v1','owner':'0x'+'22'*20,
            'executionId':'pex_'+'aa'*12,'verifiedAt':'2026-09-08T00:00:00Z','tokenId':'123',
            'orderId':'0x'+'aa'*32,'transactionHash':'0x'+'bb'*32,'fillSize':5,'fillPrice':0.5,
            'fillAmountUsdc':2.5,'chainId':'eip155:137','blockHash':'0x'+'cc'*32,
            'finalizedBlockHash':'0x'+'dd'*32,'researchPolicy':'agent-independent-v1'}

    def capture(self):
        return bridge['capture'](self.root, json.dumps(self.body).encode())

    def test_capture_reopen_and_duplicate_are_identical(self):
        first = self.capture()
        self.assertEqual(first, self.capture())
        self.assertEqual(first['state'], 'SIBYL_CAPTURED_AND_RECALLED')
        self.assertEqual(first['payloadHash'], hashlib.sha256(json.dumps(self.body).encode()).hexdigest())

    def test_signed_a2a_order_correlation_survives_capture_and_recall(self):
        self.body['externalOrderId'] = 'a2a_' + 'ab' * 32
        self.capture()
        self.assertEqual(self.recall()['records'][0]['receipt']['externalOrderId'], self.body['externalOrderId'])

    def test_unstructured_a2a_correlation_is_rejected(self):
        self.body['externalOrderId'] = 'untrusted task prose'
        with self.assertRaises(ValueError): self.capture()

    def test_conflicting_receipt_cannot_overwrite(self):
        self.capture()
        self.body['fillSize'] = 10
        with self.assertRaises(ValueError): self.capture()
        self.body['fillSize'] = 5
        self.assertTrue(self.capture()['ok'])

    def recall(self, owner=None, digest=None):
        request = {'owner': owner or self.body['owner'], 'records': [{
            'executionId': self.body['executionId'],
            'payloadHash': digest or hashlib.sha256(json.dumps(self.body).encode()).hexdigest()}]}
        return bridge['recall'](self.root, json.dumps(request).encode())

    def test_fresh_recall_returns_actual_entity_and_never_recaptures(self):
        self.capture()
        recalled = self.recall()
        self.assertEqual(recalled['records'][0]['receipt'], self.body)
        scope = hashlib.sha256(('polydesk-buyer-v1:' + self.body['owner']).encode()).hexdigest()
        database = self.root / scope / 'memory.db'
        database.rename(database.with_suffix('.removed'))
        with self.assertRaises(FileNotFoundError): self.recall()
        self.assertFalse(database.exists())

    def test_recall_rejects_cross_owner_and_hash_mismatch(self):
        self.capture()
        with self.assertRaises(FileNotFoundError): self.recall(owner='0x'+'33'*20)
        with self.assertRaises(ValueError): self.recall(digest='0'*64)
        self.assertEqual(len(list(self.root.iterdir())), 1)

    def test_empty_recall_validates_root_without_creating_owner_store(self):
        request = json.dumps({'owner': self.body['owner'], 'records': []}).encode()
        self.assertEqual(bridge['recall'](self.root, request)['records'], [])
        self.assertEqual(list(self.root.iterdir()), [])
        with self.assertRaises(FileNotFoundError): bridge['recall'](self.root/'missing', request)

    def test_owner_scopes_do_not_share_records(self):
        self.capture()
        self.body['owner'] = '0x'+'33'*20
        self.body['fillSize'] = 10
        self.assertTrue(self.capture()['ok'])
        self.assertEqual(len(list(self.root.iterdir())), 2)

    def test_unsafe_or_missing_root_not_repaired(self):
        with self.assertRaises(FileNotFoundError):
            bridge['capture'](self.root/'missing', json.dumps(self.body).encode())
        self.root.chmod(0o755)
        with self.assertRaises(ValueError): self.capture()
        self.assertEqual(list(self.root.iterdir()), [])

    def test_extra_payload_fields_rejected_before_storage(self):
        self.body['signature'] = 'must not be stored'
        with self.assertRaises(ValueError): self.capture()
        self.assertEqual(list(self.root.iterdir()), [])
