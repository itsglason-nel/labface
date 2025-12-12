# LabFace Production Deployment Script (PowerShell)
# This script automates the deployment process for Windows

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "LabFace Production Deployment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.production exists
if (-Not (Test-Path ".env.production")) {
    Write-Host "Error: .env.production file not found!" -ForegroundColor Red
    Write-Host "Please create .env.production from .env.production.template"
    Write-Host "and update with your production credentials."
    exit 1
}

# Step 1: Stop development environment
Write-Host "Step 1: Stopping development environment..." -ForegroundColor Yellow
try {
    docker-compose down 2>$null
} catch {
    # Ignore errors if no containers are running
}
Write-Host "✓ Development environment stopped" -ForegroundColor Green
Write-Host ""

# Step 2: Build production images
Write-Host "Step 2: Building production images..." -ForegroundColor Yellow
Write-Host "This may take 5-15 minutes..."
docker-compose -f docker-compose.prod.yml build --no-cache
Write-Host "✓ Production images built" -ForegroundColor Green
Write-Host ""

# Step 3: Start production services
Write-Host "Step 3: Starting production services..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
Write-Host "✓ Production services started" -ForegroundColor Green
Write-Host ""

# Step 4: Wait for services to be ready
Write-Host "Step 4: Waiting for services to be ready..." -ForegroundColor Yellow
Write-Host "Waiting 30 seconds for services to initialize..."
Start-Sleep -Seconds 30
Write-Host "✓ Services should be ready" -ForegroundColor Green
Write-Host ""

# Step 5: Check service status
Write-Host "Step 5: Checking service status..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml ps
Write-Host ""

# Step 6: Show application URL
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application should be accessible at:" -ForegroundColor White
Write-Host "https://labface.site" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Visit https://labface.site to verify the application is running"
Write-Host "2. Create an admin account (see deployment guide)"
Write-Host "3. Test student and professor registration"
Write-Host "4. Configure RTSP cameras (if not already done)"
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  View logs:    docker-compose -f docker-compose.prod.yml logs -f"
Write-Host "  Stop:         docker-compose -f docker-compose.prod.yml down"
Write-Host "  Restart:      docker-compose -f docker-compose.prod.yml restart"
Write-Host ""
Write-Host "For troubleshooting, check the deployment guide in the artifacts folder."
Write-Host ""
