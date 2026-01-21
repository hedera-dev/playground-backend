#!/bin/bash
# Network filter for isolate sandbox using a dedicated network namespace
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

NETNS_NAME="sandbox"
VETH_HOST="veth-host"
VETH_SANDBOX="veth-sandbox"
SUBNET="10.200.0"

echo "Setting up network namespace filter for isolate sandbox..."

# Check if ip command is available
if ! command -v ip &> /dev/null; then
    echo "ERROR: iproute2 (ip command) not installed"
    exit 1
fi

# Check if iptables is available
if ! command -v iptables &> /dev/null; then
    echo "ERROR: iptables not installed"
    exit 1
fi

# Create network namespace for sandbox
echo "Creating network namespace: $NETNS_NAME"
ip netns add $NETNS_NAME 2>/dev/null || true

# Create veth pair to connect host and sandbox namespace
echo "Creating veth pair..."
ip link add $VETH_HOST type veth peer name $VETH_SANDBOX 2>/dev/null || true

# Move sandbox end to the namespace
ip link set $VETH_SANDBOX netns $NETNS_NAME 2>/dev/null || true

# Configure host side
echo "Configuring host side..."
ip addr add ${SUBNET}.1/30 dev $VETH_HOST 2>/dev/null || true
ip link set $VETH_HOST up

# Configure sandbox side
echo "Configuring sandbox namespace..."
ip netns exec $NETNS_NAME ip addr add ${SUBNET}.2/30 dev $VETH_SANDBOX
ip netns exec $NETNS_NAME ip link set $VETH_SANDBOX up
ip netns exec $NETNS_NAME ip link set lo up
ip netns exec $NETNS_NAME ip route add default via ${SUBNET}.1

# Enable IP forwarding
echo "Enabling IP forwarding..."
echo 1 > /proc/sys/net/ipv4/ip_forward

# Setup NAT for outgoing traffic from sandbox
echo "Setting up NAT..."
iptables -t nat -C POSTROUTING -s ${SUBNET}.0/30 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING -s ${SUBNET}.0/30 -j MASQUERADE

# Create FORWARD chain rules for sandbox traffic filtering
echo "Setting up firewall rules..."

# Allow established connections
iptables -C FORWARD -s ${SUBNET}.2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
iptables -A FORWARD -s ${SUBNET}.2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow DNS
iptables -C FORWARD -s ${SUBNET}.2 -p udp --dport 53 -j ACCEPT 2>/dev/null || \
iptables -A FORWARD -s ${SUBNET}.2 -p udp --dport 53 -j ACCEPT

# Allow Hedera testnet IPs
for ip in "${HEDERA_IPS[@]}"; do
    iptables -C FORWARD -s ${SUBNET}.2 -d "$ip" -j ACCEPT 2>/dev/null || \
    iptables -A FORWARD -s ${SUBNET}.2 -d "$ip" -j ACCEPT
done

# Block everything else from sandbox
iptables -C FORWARD -s ${SUBNET}.2 -j REJECT --reject-with icmp-admin-prohibited 2>/dev/null || \
iptables -A FORWARD -s ${SUBNET}.2 -j REJECT --reject-with icmp-admin-prohibited

# Allow return traffic to sandbox
iptables -C FORWARD -d ${SUBNET}.2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
iptables -A FORWARD -d ${SUBNET}.2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

echo ""
echo "Network namespace filter configured successfully!"
echo "Namespace: $NETNS_NAME"
echo "Sandbox IP: ${SUBNET}.2"
echo ""
echo "Allowed destinations for sandboxed code:"
echo "  - DNS (UDP/53)"
echo "  - Hedera testnet nodes: ${HEDERA_IPS[*]}"
echo ""
echo "To run a command in the sandbox namespace:"
echo "  ip netns exec $NETNS_NAME <command>"
echo ""

# Verify namespace exists
echo "Verifying namespace..."
ip netns list | grep -q $NETNS_NAME && echo "✓ Namespace $NETNS_NAME exists" || echo "✗ Namespace not found"

# Verify connectivity from sandbox
echo "Testing sandbox network connectivity..."
ip netns exec $NETNS_NAME ping -c 1 -W 2 ${SUBNET}.1 > /dev/null 2>&1 && \
    echo "✓ Sandbox can reach host gateway" || \
    echo "✗ Sandbox cannot reach host gateway"
