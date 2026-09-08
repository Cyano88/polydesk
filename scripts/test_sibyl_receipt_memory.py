import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest

bridge = runpy.run_path(str(Path(__file__).with_name('sibyl-receipt-memory.py')))


class ReceiptMemoryTests(unittest.TestCase):
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

    def test_conflicting_receipt_cannot_overwrite(self):
        self.capture()
        self.body['fillSize'] = 10
        with self.assertRaises(ValueError): self.capture()
        self.body['fillSize'] = 5
        self.assertTrue(self.capture()['ok'])

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
