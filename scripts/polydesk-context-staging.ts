import {
  createPolydeskContextStagingApp,
  POLYDESK_CONTEXT_STAGING_HOST,
  polydeskContextStagingPort,
  requirePolydeskContextStaging,
} from '../api/polydesk-context-staging.js'

requirePolydeskContextStaging(process.env)
const port = polydeskContextStagingPort(process.env)
const app = createPolydeskContextStagingApp()
const server = app.listen(port, POLYDESK_CONTEXT_STAGING_HOST, () => {
  console.log(JSON.stringify({
    ok: true,
    service: 'polydesk-context-staging',
    host: POLYDESK_CONTEXT_STAGING_HOST,
    port,
    readOnly: true,
    production: false,
  }))
})

server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000

function close() {
  server.close(error => {
    process.exitCode = error ? 1 : 0
  })
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
