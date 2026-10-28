import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
process.umask(0o077)
const runtime=resolve('.veildesk-runtime')
const revision='2dd3c860cbcf6d93b9df5f30d952b3d2c962f58d'
if(process.platform!=='linux'||Number(process.versions.node.split('.')[0])<24)throw Error('Provider requires Linux and Node 24')
const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim()
if(actual!==revision||execFileSync('git',['status','--porcelain'],{cwd:runtime,encoding:'utf8'}).trim())throw Error('Unverified VeilDesk runtime')
const mounts=await readFile('/proc/self/mountinfo','utf8')
if(!mounts.split('\n').some(line=>line.split(' ')[4]==='/var/data'))throw Error('Provider persistent disk is required')
const raw=process.env.VEILDESK_CONFIG_JSON??await readFile('/etc/secrets/veildesk.json','utf8')
delete process.env.VEILDESK_CONFIG_JSON
const {renderConfig}=await import(pathToFileURL(join(runtime,'src/render-config.mjs')).href)
const config=renderConfig('provider',JSON.parse(raw),{relayUrl:process.env.VEILDESK_RELAY_URL})
const directory=await mkdtemp(join(tmpdir(),'polydesk-veildesk-'))
const file=join(directory,'config.json')
await writeFile(file,JSON.stringify(config),{mode:0o600})
process.env.VEILDESK_PROVIDER_CONFIG=file
process.env.VEILDESK_RUNTIME_DIRECTORY=runtime
console.log('PolyDesk research worker starting with pinned VeilDesk transport; trade execution disabled.')
await import('./veildesk-provider-worker.js')

