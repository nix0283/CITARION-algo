#!/bin/bash
# Start script for Lumibot Service

cd "$(dirname "$0")"

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Start the service
python main.py
