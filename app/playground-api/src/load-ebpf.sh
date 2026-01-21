#!/bin/bash
# Load eBPF network filter for isolate sandbox

set -e

EBPF_PROG="/usr/local/lib/bpf/network_filter.o"
CGROUP_PATH="/sys/fs/cgroup/isolate"
BPF_PIN_PATH="/sys/fs/bpf/isolate_network_filter"

echo "Loading eBPF network filter..."

# Check if BPF filesystem is mounted
if [ ! -d "/sys/fs/bpf" ]; then
    echo "ERROR: BPF filesystem not mounted"
    exit 1
fi

# Check if eBPF program exists
if [ ! -f "$EBPF_PROG" ]; then
    echo "ERROR: eBPF program not found at $EBPF_PROG"
    exit 1
fi

# Check if cgroup exists
if [ ! -d "$CGROUP_PATH" ]; then
    echo "ERROR: Cgroup not found at $CGROUP_PATH"
    exit 1
fi

# Load and attach eBPF program to cgroup
# Using bpftool if available, otherwise use libbpf directly
if command -v bpftool &> /dev/null; then
    echo "Using bpftool to load eBPF program..."
    bpftool prog load "$EBPF_PROG" "$BPF_PIN_PATH" type cgroup/skb
    bpftool cgroup attach "$CGROUP_PATH" egress pinned "$BPF_PIN_PATH"
    echo "eBPF program loaded and attached successfully"
else
    echo "WARNING: bpftool not available, eBPF filtering will not be active"
    echo "Falling back to no network filtering (relying on GCP firewall only)"
    exit 0
fi
