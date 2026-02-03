#!/usr/bin/env bash
set -e

# Get PORT from environment or default to 10000
export PORT=${PORT:-10000}

echo "==> Starting PDF Parser Service on port ${PORT}"
echo "==> Memory limit: $(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo 'unknown')"

# Start gunicorn with minimal memory footprint
exec gunicorn app:app \
  --bind "0.0.0.0:${PORT}" \
  --workers 1 \
  --worker-class sync \
  --timeout 300 \
  --max-requests 50 \
  --max-requests-jitter 10 \
  --log-level info \
  --access-logfile - \
  --error-logfile - \
  --preload
