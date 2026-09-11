#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/polydesk-a2a/worker.env
set +a

exec flock -n /var/lib/polydesk-a2a/managed-agent-reconcile.lock \
  /bin/bash /opt/polydesk-a2a/app/ops/polydesk-a2a/managed-cycle.sh
