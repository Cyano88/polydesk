#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' 'Run this installer with sudo.' >&2
  exit 1
fi

if [[ "$(systemctl is-active pocket-nft-worker 2>/dev/null || true)" != 'active' ]]; then
  printf '%s\n' 'Pocket Concierge worker is not active; refusing to modify the shared VPS.' >&2
  exit 1
fi

if ! id polydesk >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash polydesk
fi

install -d -o polydesk -g polydesk -m 0750 /opt/polydesk-a2a
install -d -o polydesk -g polydesk -m 0750 /opt/polydesk-a2a/workspace
install -d -o polydesk -g polydesk -m 0700 /var/lib/polydesk-a2a
install -d -o root -g polydesk -m 0750 /etc/polydesk-a2a

if [[ -d /opt/polydesk-a2a/app/.git ]]; then
  sudo -u polydesk git -C /opt/polydesk-a2a/app fetch origin main
  sudo -u polydesk git -C /opt/polydesk-a2a/app checkout main
  sudo -u polydesk git -C /opt/polydesk-a2a/app pull --ff-only
else
  sudo -u polydesk git clone --branch main --single-branch https://github.com/Cyano88/polydesk.git /opt/polydesk-a2a/app
fi

sudo -u polydesk env HOME=/home/polydesk npm --prefix /opt/polydesk-a2a/app ci
npm install --global @openai/codex @okxweb3/a2a-node

sudo -u polydesk env HOME=/home/polydesk bash -lc \
  'curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh'

install -o polydesk -g polydesk -m 0640 \
  /opt/polydesk-a2a/app/ops/polydesk-a2a/AGENTS.md \
  /opt/polydesk-a2a/workspace/AGENTS.md

install -o root -g root -m 0644 \
  /opt/polydesk-a2a/app/ops/polydesk-a2a/polydesk-a2a-daemon.service \
  /etc/systemd/system/polydesk-a2a-daemon.service

if [[ ! -e /etc/polydesk-a2a/worker.env ]]; then
  umask 027
  printf '%s\n' \
    'POLYDESK_A2A_OPERATOR_KEY=SET_BEFORE_START' \
    'POLYDESK_A2A_URL=https://polydesk.trade/api/a2a/polydesk-trading-agent' \
    'POLYDESK_A2A_RECEIPT_ORIGIN=https://polydesk.trade/api/a2a/polydesk-trading-agent' \
    'POLYDESK_A2A_WORKER_STATE=/var/lib/polydesk-a2a/worker.json' \
    'ONCHAINOS_BIN=/home/polydesk/.local/bin/onchainos' \
    'OKX_A2A_BIN=/usr/local/bin/okx-a2a' \
    > /etc/polydesk-a2a/worker.env
  chown root:polydesk /etc/polydesk-a2a/worker.env
  chmod 0640 /etc/polydesk-a2a/worker.env
fi

systemctl daemon-reload

sudo -u polydesk env HOME=/home/polydesk npm --prefix /opt/polydesk-a2a/app run typecheck:server
sudo -u polydesk env HOME=/home/polydesk npm --prefix /opt/polydesk-a2a/app run test:a2a-trading
sudo -u polydesk env HOME=/home/polydesk npm --prefix /opt/polydesk-a2a/app run test:a2a-worker

printf 'Pocket worker: %s\n' "$(systemctl is-active pocket-nft-worker)"
printf 'PolyDesk commit: %s\n' "$(sudo -u polydesk git -C /opt/polydesk-a2a/app rev-parse --short HEAD)"
printf 'Node: %s\n' "$(node --version)"
printf 'Codex: %s\n' "$(codex --version)"
printf 'A2A: %s\n' "$(okx-a2a --version)"
printf 'OnchainOS: %s\n' "$(sudo -u polydesk env HOME=/home/polydesk /home/polydesk/.local/bin/onchainos --version)"
printf '%s\n' 'Base installation complete. Service was not started; configure credentials and wallet login first.'
