import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'linux') process.exit(0)

const binary = resolve('.render-home/.local/bin/onchainos')
if (existsSync(binary)) process.exit(0)

const install = spawnSync('sh', ['scripts/install-onchainos-render.sh'], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

if (install.error) throw install.error
if (install.status !== 0 || !existsSync(binary)) {
  throw new Error(`Onchain OS installation failed with exit code ${install.status ?? 'unknown'}.`)
}
