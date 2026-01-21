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

# Configure iptables to restrict network access for isolate users (UIDs 1001-1500)
# Allow only connections to Hedera testnet nodes
echo "Configuring network restrictions for user code execution..."

# Hedera testnet node IPs
HEDERA_IPS=(
  "34.94.106.61" "50.18.132.211" "35.237.119.55"
  "3.212.6.13" "35.245.27.193" "52.20.18.86"
  "34.83.112.116" "54.70.192.33" "34.94.160.4"
  "54.176.199.109" "34.106.102.218" "35.155.49.147"
  "34.133.197.230" "52.14.252.207" "35.186.230.203"
)

# Allow localhost communication for all users
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow DNS for isolate users (needed to resolve Hedera hostnames)
iptables -A OUTPUT -p udp --dport 53 -m owner --uid-owner 1001:1500 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -m owner --uid-owner 1001:1500 -j ACCEPT

# Allow connections to Hedera testnet nodes for isolate users
for ip in "${HEDERA_IPS[@]}"; do
  iptables -A OUTPUT -d "$ip" -m owner --uid-owner 1001:1500 -j ACCEPT
done

# Block all other outbound connections for isolate users (UIDs 1001-1500)
iptables -A OUTPUT -m owner --uid-owner 1001:1500 -j REJECT --reject-with icmp-net-prohibited

# Allow all traffic for other users (playground user, root, etc.)
iptables -A OUTPUT -j ACCEPT

echo "Network restrictions configured successfully"

chown -R playground:playground /pkgs_manager && \
exec su -- playground -c 'ulimit -n 65536 && node /playground-api/src'


