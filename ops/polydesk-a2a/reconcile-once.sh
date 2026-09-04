#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/polydesk-a2a/worker.env
set +a

exec flock -n /var/lib/polydesk-a2a/managed-agent-reconcile.lock \
  npm --prefix /opt/polydesk-a2a/app run managed-agent:operator -- --once
