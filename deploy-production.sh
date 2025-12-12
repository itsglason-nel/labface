#!/bin/bash

# LabFace Production Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "======================================"
echo "LabFace Production Deployment"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Please create .env.production from .env.production.template"
    echo "and update with your production credentials."
    exit 1
fi

# Check if running with sudo (if needed for port 80/443)
if [ "$EUID" -ne 0 ] && [ "$(uname)" != "Darwin" ]; then 
    echo -e "${YELLOW}Warning: You may need sudo privileges to bind to ports 80 and 443${NC}"
    echo "If deployment fails, try running with sudo"
    echo ""
fi

# Step 1: Stop development environment
echo -e "${YELLOW}Step 1: Stopping development environment...${NC}"
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✓ Development environment stopped${NC}"
echo ""

# Step 2: Build production images
echo -e "${YELLOW}Step 2: Building production images...${NC}"
echo "This may take 5-15 minutes..."
docker-compose -f docker-compose.prod.yml build --no-cache
echo -e "${GREEN}✓ Production images built${NC}"
echo ""

# Step 3: Start production services
echo -e "${YELLOW}Step 3: Starting production services...${NC}"
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
echo -e "${GREEN}✓ Production services started${NC}"
echo ""

# Step 4: Wait for services to be ready
echo -e "${YELLOW}Step 4: Waiting for services to be ready...${NC}"
echo "Waiting 30 seconds for services to initialize..."
sleep 30
echo -e "${GREEN}✓ Services should be ready${NC}"
echo ""

# Step 5: Check service status
echo -e "${YELLOW}Step 5: Checking service status...${NC}"
docker-compose -f docker-compose.prod.yml ps
echo ""

# Step 6: Verify database
echo -e "${YELLOW}Step 6: Verifying database...${NC}"
if docker-compose -f docker-compose.prod.yml exec -T mariadb mariadb -u root -p$(grep DB_ROOT_PASSWORD .env.production | cut -d '=' -f2) -e "USE labface; SHOW TABLES;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database is accessible${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    echo "Check logs: docker-compose -f docker-compose.prod.yml logs mariadb"
fi
echo ""

# Step 7: Show application URL
echo "======================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo "Your application should be accessible at:"
echo -e "${GREEN}https://labface.site${NC}"
echo ""
echo "Next steps:"
echo "1. Visit https://labface.site to verify the application is running"
echo "2. Create an admin account (see deployment guide)"
echo "3. Test student and professor registration"
echo "4. Configure RTSP cameras (if not already done)"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "  Stop:         docker-compose -f docker-compose.prod.yml down"
echo "  Restart:      docker-compose -f docker-compose.prod.yml restart"
echo ""
echo "For troubleshooting, check the deployment guide in the artifacts folder."
echo ""
