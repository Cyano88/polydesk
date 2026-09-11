#!/usr/bin/env bash
set -euo pipefail
cd /opt/polydesk-a2a/app
npm run managed-agent:operator -- --once
node --import tsx scripts/polydesk-managed-delivery.ts --once --deliver
