#!/bin/bash

CGROUP_FS="/sys/fs/cgroup"
if [ ! -e "$CGROUP_FS" ]; then
  echo "Cannot find $CGROUP_FS. Please make sure your system is using cgroup v2"
  exit 1
fi

if [ -e "$CGROUP_FS/unified" ]; then
  echo "Combined cgroup v1+v2 mode is not supported. Please make sure your system is using pure cgroup v2"
  exit 1
fi

if [ ! -e "$CGROUP_FS/cgroup.subtree_control" ]; then
  echo "Cgroup v2 not found. Please make sure cgroup v2 is enabled on your system"
  exit 1
fi

cd /sys/fs/cgroup && \
mkdir isolate/ && \
echo 1 > isolate/cgroup.procs && \
echo '+cpuset +cpu +io +memory +pids' > cgroup.subtree_control && \
cd isolate && \
mkdir init && \
echo 1 > init/cgroup.procs && \
echo '+cpuset +memory' > cgroup.subtree_control && \
echo "Initialized cgroup"

# Configure iptables to restrict network access for isolate sandbox
# Allow only connections to Hedera testnet nodes
# Uses cgroup matching instead of UID matching to work with isolate's user namespace (-s flag)
echo "Configuring network restrictions for user code execution..."

# Create a dedicated cgroup for isolate network filtering
ISOLATE_NET_CGROUP="/sys/fs/cgroup/isolate_net"
mkdir -p "$ISOLATE_NET_CGROUP"

# Hedera testnet node IPs
HEDERA_IPS=(
  "34.94.106.61" "50.18.132.211" "35.237.119.55"
  "3.212.6.13" "35.245.27.193" "52.20.18.86"
  "34.83.112.116" "54.70.192.33" "34.94.160.4"
  "54.176.199.109" "34.106.102.218" "35.155.49.147"
  "34.133.197.230" "52.14.252.207" "35.186.230.203"
)

# Allow localhost communication for all
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow DNS for processes in isolate_net cgroup
iptables -A OUTPUT -p udp --dport 53 -m cgroup --path "$ISOLATE_NET_CGROUP" -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -m cgroup --path "$ISOLATE_NET_CGROUP" -j ACCEPT

# Allow connections to Hedera testnet nodes for processes in isolate_net cgroup
for ip in "${HEDERA_IPS[@]}"; do
  iptables -A OUTPUT -d "$ip" -m cgroup --path "$ISOLATE_NET_CGROUP" -j ACCEPT
done

# Block all other outbound connections for processes in isolate_net cgroup
iptables -A OUTPUT -m cgroup --path "$ISOLATE_NET_CGROUP" -j REJECT --reject-with icmp-net-prohibited

# Allow all traffic for other processes
iptables -A OUTPUT -j ACCEPT

echo "Network restrictions configured successfully"
echo "Isolate network cgroup created at: $ISOLATE_NET_CGROUP"

chown -R playground:playground /pkgs_manager && \
exec su -- playground -c 'ulimit -n 65536 && node /playground-api/src'


