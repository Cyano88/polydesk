import assert from 'node:assert/strict'
import test from 'node:test'
import { trustedHashPayLinkUrl } from '../src/lib/hashPayLinkUrl.js'

test('accepts both official Hash PayLink production hosts', () => {
  assert.equal(
    trustedHashPayLinkUrl('https://hashpaylink.com/pay/a/chk_123?attempt=pat_123', '/pay/'),
    'https://hashpaylink.com/pay/a/chk_123?attempt=pat_123',
  )
  assert.equal(
    trustedHashPayLinkUrl('https://app.hashpaylink.com/pay/a/chk_123?attempt=pat_123', '/pay/'),
    'https://app.hashpaylink.com/pay/a/chk_123?attempt=pat_123',
  )
})

test('rejects lookalike, insecure, credentialed, and non-checkout URLs', () => {
  assert.equal(trustedHashPayLinkUrl('https://hashpaylink.com.evil.example/pay/a/chk_123', '/pay/'), '')
  assert.equal(trustedHashPayLinkUrl('http://hashpaylink.com/pay/a/chk_123', '/pay/'), '')
  assert.equal(trustedHashPayLinkUrl('https://user:pass@hashpaylink.com/pay/a/chk_123', '/pay/'), '')
  assert.equal(trustedHashPayLinkUrl('https://hashpaylink.com/agent', '/pay/'), '')
})

