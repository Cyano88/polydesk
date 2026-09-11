import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const args = process.argv.slice(2)
const option = name => args[args.indexOf(name) + 1]
for (const name of ['--tenant', '--app', '--out']) if (!args.includes(name)) throw new Error('Required: --tenant ID --app ID --out NEW_PRIVATE_DIRECTORY')
const tenantId = option('--tenant'), applicationId = option('--app')
if (![tenantId, applicationId].every(v => /^[a-zA-Z0-9_-]{1,100}$/.test(v))) throw new Error('Invalid tenant or application ID')
const directory = resolve(option('--out'))
mkdirSync(directory, { mode: 0o700 }) // Refuse an existing directory; never overwrite credentials.
const secret = randomBytes(32).toString('hex'), keyId = randomUUID()
const record = { keyId, tenantId, applicationId, scopes: ['jobs:read', 'jobs:create', 'jobs:resume'], secretHash: createHash('sha256').update(secret).digest('hex'), expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), revoked: false }
writeFileSync(join(directory, 'partner-key.txt'), `pdp_${keyId}_${secret}\n`, { mode: 0o600, flag: 'wx' })
writeFileSync(join(directory, 'server-record.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
console.log('Created private credential files. Import the server record into POLYDESK_PARTNER_KEYS_JSON and deliver partner-key.txt through your approved secret channel. No secret was printed.')
