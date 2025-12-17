#!/bin/bash

# Crash Game ML - Start All Services
# This script starts Redis, ML inference service, and the Node.js observer

echo "========================================="
echo "    Crash Game ML - Starting Services"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$ML_DIR")"

echo "Project directory: $PROJECT_DIR"
echo "ML service directory: $ML_DIR"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Redis
echo "Checking Redis..."
if command_exists redis-cli; then
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}Redis is running${NC}"
    else
        echo -e "${YELLOW}Redis is installed but not running. Starting...${NC}"
        if command_exists brew; then
            brew services start redis
        else
            redis-server --daemonize yes
        fi
        sleep 2
        if redis-cli ping > /dev/null 2>&1; then
            echo -e "${GREEN}Redis started successfully${NC}"
        else
            echo -e "${RED}Failed to start Redis. Please start it manually.${NC}"
            exit 1
        fi
    fi
else
    echo -e "${RED}Redis is not installed. Please install it first.${NC}"
    echo "macOS: brew install redis"
    echo "Ubuntu: sudo apt install redis-server"
    exit 1
fi

echo ""

# Check Python virtual environment
echo "Checking Python environment..."
if [ -d "$ML_DIR/venv" ]; then
    echo -e "${GREEN}Virtual environment found${NC}"
else
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    cd "$ML_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo -e "${GREEN}Virtual environment created and dependencies installed${NC}"
fi

echo ""

# Check if models exist
echo "Checking ML models..."
if [ -f "$ML_DIR/models/model_gt_2x.joblib" ]; then
    echo -e "${GREEN}ML models found${NC}"
else
    echo -e "${YELLOW}ML models not found. Training...${NC}"
    cd "$ML_DIR"
    source venv/bin/activate
    python training.py
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Models trained successfully${NC}"
    else
        echo -e "${RED}Model training failed. Check the data and try again.${NC}"
        exit 1
    fi
fi

echo ""
echo "========================================="
echo "  Starting Services (use Ctrl+C to stop)"
echo "========================================="
echo ""

# Start ML inference service in background
echo "Starting ML inference service..."
cd "$ML_DIR"
source venv/bin/activate
python inference.py &
ML_PID=$!
echo "ML service started with PID: $ML_PID"

sleep 2

# Start Node.js observer
echo ""
echo "Starting Node.js observer..."
cd "$PROJECT_DIR"
npm run dev

# When npm run dev is stopped, also stop the ML service
echo ""
echo "Stopping ML service..."
kill $ML_PID 2>/dev/null

echo "All services stopped."
