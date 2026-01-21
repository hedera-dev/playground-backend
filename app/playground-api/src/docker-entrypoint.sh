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

# Load eBPF network filter for isolate sandbox
# This allows user namespace (-s flag) to work while still controlling network access
/playground-api/src/load-ebpf.sh || echo "WARNING: eBPF filter not loaded, network filtering disabled"

chown -R playground:playground /pkgs_manager && \
exec su -- playground -c 'ulimit -n 65536 && node /playground-api/src'


