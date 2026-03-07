#!/bin/bash
# CITARION Python Microservices Startup Script
# Usage: ./start-services.sh [service-name]
# service-name: lumibot | ml | rl | all (default: all)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="/home/z/my-project"

# Configuration
SERVICES=(
    "lumibot:3004:${PROJECT_ROOT}/lumibot-service"
    "ml:3006:${PROJECT_ROOT}/mini-services/ml-service"
    "rl:3007:${PROJECT_ROOT}/mini-services/rl-service"
)

# Function to check if a service is running
is_running() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start a service
start_service() {
    local name=$1
    local port=$2
    local path=$3
    
    echo -e "${BLUE}Starting ${name} service on port ${port}...${NC}"
    
    # Check if already running
    if is_running $port; then
        echo -e "${YELLOW}Service ${name} already running on port ${port}${NC}"
        return 0
    fi
    
    # Check if virtual environment exists
    if [ -d "${path}/venv" ]; then
        source "${path}/venv/bin/activate"
    elif [ -d "${PROJECT_ROOT}/.venv" ]; then
        source "${PROJECT_ROOT}/.venv/bin/activate"
    fi
    
    # Start the service
    cd "$path"
    nohup python main.py > "${path}/logs/service.log" 2>&1 &
    local pid=$!
    
    # Wait for service to start
    sleep 2
    
    if is_running $port; then
        echo -e "${GREEN}✓ ${name} service started (PID: ${pid}, Port: ${port})${NC}"
    else
        echo -e "${RED}✗ Failed to start ${name} service${NC}"
        return 1
    fi
}

# Function to start all services
start_all() {
    echo -e "${BLUE}Starting all Python microservices...${NC}"
    echo ""
    
    for service in "${SERVICES[@]}"; do
        IFS=':' read -r name port path <<< "$service"
        start_service "$name" "$port" "$path"
        echo ""
    done
    
    echo -e "${GREEN}All services started!${NC}"
    show_status
}

# Function to show status
show_status() {
    echo -e "\n${BLUE}Service Status:${NC}"
    echo "================================"
    
    for service in "${SERVICES[@]}"; do
        IFS=':' read -r name port path <<< "$service"
        if is_running $port; then
            echo -e "${GREEN}● ${name} service: RUNNING (port ${port})${NC}"
        else
            echo -e "${RED}○ ${name} service: STOPPED${NC}"
        fi
    done
    
    echo "================================"
}

# Function to stop a service
stop_service() {
    local name=$1
    local port=$2
    
    echo -e "${YELLOW}Stopping ${name} service...${NC}"
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        kill $(lsof -Pi :$port -sTCP:LISTEN -t) 2>/dev/null || true
        echo -e "${GREEN}✓ ${name} service stopped${NC}"
    else
        echo -e "${YELLOW}Service ${name} not running${NC}"
    fi
}

# Function to stop all services
stop_all() {
    echo -e "${YELLOW}Stopping all Python microservices...${NC}"
    
    for service in "${SERVICES[@]}"; do
        IFS=':' read -r name port path <<< "$service"
        stop_service "$name" "$port"
    done
    
    echo -e "${GREEN}All services stopped${NC}"
}

# Main logic
case "$1" in
    "lumibot")
        start_service "lumibot" "3004" "${PROJECT_ROOT}/lumibot-service"
        ;;
    "ml")
        start_service "ml" "3006" "${PROJECT_ROOT}/mini-services/ml-service"
        ;;
    "rl")
        start_service "rl" "3007" "${PROJECT_ROOT}/mini-services/rl-service"
        ;;
    "all"|"")
        start_all
        ;;
    "stop")
        stop_all
        ;;
    "status")
        show_status
        ;;
    *)
        echo "Usage: $0 {lumibot|ml|rl|all|stop|status}"
        exit 1
        ;;
esac
