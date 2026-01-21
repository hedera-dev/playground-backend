#!/bin/bash
# Network filter for isolate sandbox using nftables
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

# Build comma-separated IP list for nftables set
HEDERA_IP_SET=$(IFS=,; echo "${HEDERA_IPS[*]}")

echo "Setting up nftables network filter for isolate sandbox..."

# Check if nftables is available
if ! command -v nft &> /dev/null; then
    echo "ERROR: nftables not installed"
    exit 1
fi

# Create nftables ruleset
# This filters outgoing connections from processes in the isolate cgroup
nft -f - <<EOF
#!/usr/sbin/nft -f

# Flush existing isolate table if exists
table inet isolate_filter
delete table inet isolate_filter

# Create new table for isolate filtering
table inet isolate_filter {
    # Set of allowed Hedera testnet IPs
    set hedera_nodes {
        type ipv4_addr
        elements = { ${HEDERA_IP_SET} }
    }

    chain output {
        type filter hook output priority 0; policy accept;
        
        # Only filter traffic from processes in isolate cgroup hierarchy
        # The cgroup path check ensures we only affect sandboxed processes
        socket cgroupv2 level 2 "isolate" jump isolate_filter_chain
    }

    chain isolate_filter_chain {
        # Allow established/related connections
        ct state established,related accept
        
        # Allow loopback
        oifname "lo" accept
        
        # Allow DNS (UDP port 53) for hostname resolution
        udp dport 53 accept
        
        # Allow connections to Hedera testnet nodes
        ip daddr @hedera_nodes accept
        
        # Log and reject everything else from isolate processes
        log prefix "isolate-blocked: " level debug
        reject with icmp type admin-prohibited
    }
}
EOF

echo "nftables network filter configured successfully"
echo "Allowed destinations for sandboxed code:"
echo "  - localhost"
echo "  - DNS (UDP/53)"
echo "  - Hedera testnet nodes: ${HEDERA_IPS[*]}"

# Verify rules are loaded
echo ""
echo "Current nftables ruleset:"
nft list table inet isolate_filter
