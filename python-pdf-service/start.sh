#!/bin/bash
# Startup script for Render deployment

# Use Render's PORT or default to 5000
PORT=${PORT:-5000}

echo "Starting gunicorn on port $PORT..."

# Start gunicorn with explicit port binding
exec gunicorn app:app \
  --bind "0.0.0.0:${PORT}" \
  --workers 1 \
  --timeout 300 \
  --log-level info \
  --access-logfile - \
  --error-logfile -
