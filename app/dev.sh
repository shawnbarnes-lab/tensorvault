#!/usr/bin/env bash
# TensorVault - Development launcher (Linux/macOS)
# Starts the Python backend then launches Electron in dev mode.
# Run this from the tensorvault/app directory.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "TensorVault Dev Mode"
echo "---------------------------------"
echo "  Backend : Python (conda rag env)"
echo "---------------------------------"

export RAG_PORT=8712
export PYTHONUNBUFFERED=1

# Start backend in the background
echo "Starting Python backend..."
python "$SCRIPT_DIR/backend/service.py" &
BACKEND_PID=$!

cleanup() {
    echo
    echo "Stopping backend (PID $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Give backend a moment to start
sleep 5

echo "Starting Electron..."
npx electron . --dev
