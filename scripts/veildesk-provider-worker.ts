import {isAbsolute,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createVeilDeskResearchEngine} from '../api/veildesk-research-engine.js'

// Deploy as a provider process on infrastructure with durable state and wallet access.
// Neither an HTTP endpoint nor an OKX task acceptance/USDC billing substitute.
const runtime=process.env.VEILDESK_RUNTIME_DIRECTORY
if(!runtime||!isAbsolute(runtime))throw new Error('Set the absolute VeilDesk runtime directory')
// PolyDesk owns research; VeilDesk retains authenticated request and settlement gates.
const research=createVeilDeskResearchEngine()
const {runProviderWorker}=await import(pathToFileURL(join(runtime,'scripts','provider-worker.mjs')).href)
await runProviderWorker({research})
