#!/bin/bash
# RL Service Startup Script
# Port: 3007

cd "$(dirname "$0")"

# Create logs directory if not exists
mkdir -p logs

# Check for virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d "../../.venv" ]; then
    source ../../.venv/bin/activate
fi

echo "Starting RL Service..."
echo "Port: 3007"
echo "Logs: ./logs/service.log"

# Start the service
python main.py 2>&1 | tee logs/service.log
