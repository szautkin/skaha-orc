#!/usr/bin/env bash
# Adds haproxy.cadc.dao.nrc.ca to /etc/hosts so the browser can reach the platform.
# Run: bash scripts/setup-hosts.sh

set -euo pipefail

HOSTNAME="haproxy.cadc.dao.nrc.ca"
IP="127.0.0.1"
ENTRY="$IP $HOSTNAME"

if grep -q "$HOSTNAME" /etc/hosts 2>/dev/null; then
  echo "✓ $HOSTNAME already in /etc/hosts"
  grep "$HOSTNAME" /etc/hosts
  exit 0
fi

echo "Adding '$ENTRY' to /etc/hosts (requires sudo)..."
echo "$ENTRY" | sudo tee -a /etc/hosts > /dev/null
echo "✓ Done. $HOSTNAME now resolves to $IP"
