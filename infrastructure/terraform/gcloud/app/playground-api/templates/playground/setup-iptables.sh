#!/bin/bash
set -e

WHITELIST_FILE="/etc/hedera-whitelist.txt"
BUCKET="${1:-playground-templates-prod}"
DOCKER_NETWORK_NAME="playground_net"
DOCKER_SUBNET="172.20.0.0/16"

echo "Downloading Hedera whitelist from gs://${BUCKET}/playground/hedera-whitelist.txt"
gsutil cp "gs://${BUCKET}/playground/hedera-whitelist.txt" "${WHITELIST_FILE}"

echo "Flushing existing iptables rules for Docker network..."
iptables -F DOCKER-USER 2>/dev/null || true
iptables -X DOCKER-USER 2>/dev/null || true
iptables -N DOCKER-USER 2>/dev/null || true

echo "Setting up iptables rules for Docker subnet: $DOCKER_SUBNET"

iptables -A DOCKER-USER -s "$DOCKER_SUBNET" -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN

while IFS= read -r line; do
  line=$(echo "$line" | sed 's/#.*//;s/^[[:space:]]*//;s/[[:space:]]*$//')
  
  if [ -n "$line" ]; then
    echo "Allowing traffic to: $line"
    iptables -A DOCKER-USER -s "$DOCKER_SUBNET" -d "$line" -j RETURN
  fi
done < "${WHITELIST_FILE}"

iptables -A DOCKER-USER -s "$DOCKER_SUBNET" -j LOG --log-prefix "DOCKER-BLOCKED: " --log-level 4
iptables -A DOCKER-USER -s "$DOCKER_SUBNET" -j DROP

echo "iptables rules configured successfully"
iptables -L DOCKER-USER -n -v
