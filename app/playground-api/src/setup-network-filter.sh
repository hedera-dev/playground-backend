#!/bin/bash
# Network filter for isolate sandbox using iptables with cgroup matching
# Only allows user code to connect to Hedera testnet nodes

set -e

# Hedera testnet node IPs
HEDERA_IPS=(
    "34.94.106.61"
    "50.18.132.211"
    "35.237.119.55"
    "3.212.6.13"
    "35.245.27.193"
    "52.20.18.86"
    "34.83.112.116"
    "54.70.192.33"
    "34.94.160.4"
    "54.176.199.109"
    "34.106.102.218"
    "35.155.49.147"
    "34.133.197.230"
    "52.14.252.207"
    "35.186.230.203"
)

# Cgroup path for isolate (relative to cgroup root)
ISOLATE_CGROUP="isolate"

echo "Setting up iptables network filter for isolate sandbox..."

# Check if iptables is available
if ! command -v iptables &> /dev/null; then
    echo "ERROR: iptables not installed"
    exit 1
fi

# Check if cgroup match module is available
if ! iptables -m cgroup --help 2>&1 | grep -q "path"; then
    echo "ERROR: iptables cgroup path match not available"
    echo "Falling back to no network filtering"
    exit 1
fi

# Create a custom chain for isolate filtering
iptables -N ISOLATE_FILTER 2>/dev/null || iptables -F ISOLATE_FILTER

# Rules for the ISOLATE_FILTER chain
# Allow established/related connections
iptables -A ISOLATE_FILTER -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow loopback
iptables -A ISOLATE_FILTER -o lo -j ACCEPT

# Allow DNS (UDP port 53)
iptables -A ISOLATE_FILTER -p udp --dport 53 -j ACCEPT

# Allow connections to Hedera testnet nodes
for ip in "${HEDERA_IPS[@]}"; do
    iptables -A ISOLATE_FILTER -d "$ip" -j ACCEPT
done

# Reject everything else with a clear message
iptables -A ISOLATE_FILTER -j REJECT --reject-with icmp-admin-prohibited

# Hook the filter chain to OUTPUT for isolate cgroup
# Using --path to match cgroup v2 paths
iptables -I OUTPUT 1 -m cgroup --path "$ISOLATE_CGROUP" -j ISOLATE_FILTER

echo "iptables network filter configured successfully"
echo "Allowed destinations for sandboxed code:"
echo "  - localhost"
echo "  - DNS (UDP/53)"
echo "  - Hedera testnet nodes: ${HEDERA_IPS[*]}"

# Verify rules are loaded
echo ""
echo "Current iptables OUTPUT chain:"
iptables -L OUTPUT -n -v --line-numbers | head -5
echo ""
echo "ISOLATE_FILTER chain:"
iptables -L ISOLATE_FILTER -n -v --line-numbers
