# LabFace Production Deployment Script
# This script automates the deployment process

param(
    [Parameter(Mandatory = $false)]
    [string]$Email = "",
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipSSL = $false
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LabFace Production Deployment" -ForegroundColor Cyan
Write-Host "  Domain: labface.site" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.prod exists
if (-not (Test-Path ".env.prod")) {
    Write-Host "Creating .env.prod from template..." -ForegroundColor Yellow
    
    if (Test-Path ".env.production") {
        Copy-Item .env.production .env.prod
        Write-Host "Please edit .env.prod and update the following:" -ForegroundColor Red
        Write-Host "  - DB_ROOT_PASSWORD" -ForegroundColor Red
        Write-Host "  - DB_PASSWORD" -ForegroundColor Red
        Write-Host "  - MINIO_ACCESS_KEY" -ForegroundColor Red
        Write-Host "  - MINIO_SECRET_KEY" -ForegroundColor Red
        Write-Host "  - CERTBOT_EMAIL" -ForegroundColor Red
        Write-Host ""
        $continue = Read-Host "Have you updated .env.prod? (yes/no)"
        if ($continue -ne "yes") {
            Write-Host "Please update .env.prod and run this script again." -ForegroundColor Yellow
            exit 1
        }
    }
    else {
        Write-Host "Error: .env.production template not found!" -ForegroundColor Red
        exit 1
    }
}

# Load environment variables
Get-Content .env.prod | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker-compose --version | Out-Null
    Write-Host "✓ Docker is installed" -ForegroundColor Green
}
catch {
    Write-Host "✗ Docker is not installed or not running!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop and ensure it's running." -ForegroundColor Red
    exit 1
}

# Check DNS
Write-Host "Checking DNS configuration..." -ForegroundColor Yellow
try {
    $dnsResult = Resolve-DnsName -Name "labface.site" -ErrorAction SilentlyContinue
    if ($dnsResult) {
        Write-Host "✓ DNS is configured for labface.site" -ForegroundColor Green
        Write-Host "  IP: $($dnsResult[0].IPAddress)" -ForegroundColor Gray
    }
    else {
        Write-Host "⚠ DNS not yet propagated for labface.site" -ForegroundColor Yellow
        Write-Host "  You may need to wait for DNS propagation before SSL will work." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠ Could not verify DNS" -ForegroundColor Yellow
}

# Get public IP
Write-Host "Getting your public IP..." -ForegroundColor Yellow
try {
    $publicIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
    Write-Host "✓ Your public IP: $publicIP" -ForegroundColor Green
    Write-Host "  Make sure your DNS points to this IP!" -ForegroundColor Gray
}
catch {
    Write-Host "⚠ Could not determine public IP" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host ""

# Stop existing containers
Write-Host "[1/6] Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down 2>$null

# Build images
Write-Host "[2/6] Building Docker images..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml build

# Start database and MinIO
Write-Host "[3/6] Starting database and MinIO..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d mariadb minio

Write-Host "Waiting for database to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 15

# Create buckets
Write-Host "[4/6] Creating MinIO buckets..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d createbuckets
Start-Sleep -Seconds 10

# Start application services
Write-Host "[5/6] Starting application services..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d backend ai-service frontend

Write-Host "Waiting for services to start..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Initialize SSL
if (-not $SkipSSL) {
    Write-Host "[6/6] Initializing SSL certificates..." -ForegroundColor Yellow
    
    if ($Email -eq "") {
        $Email = Read-Host "Enter your email for SSL certificate notifications"
    }
    
    # Update the init-ssl.ps1 script with the email
    $sslScript = Get-Content ".\scripts\init-ssl.ps1" -Raw
    $sslScript = $sslScript -replace '\$EMAIL = ".*"', "`$EMAIL = `"$Email`""
    Set-Content ".\scripts\init-ssl.ps1" $sslScript
    
    # Run SSL initialization
    & ".\scripts\init-ssl.ps1"
}
else {
    Write-Host "[6/6] Skipping SSL initialization (--SkipSSL flag set)" -ForegroundColor Yellow
    Write-Host "Starting nginx without SSL..." -ForegroundColor Yellow
    docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d nginx
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Check container status
Write-Host "Container Status:" -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Visit https://labface.site to access your application" -ForegroundColor White
Write-Host "  2. Check logs: docker-compose -f docker-compose.prod.yml logs -f" -ForegroundColor White
Write-Host "  3. Monitor containers: docker-compose -f docker-compose.prod.yml ps" -ForegroundColor White
Write-Host ""

if (-not $SkipSSL) {
    Write-Host "SSL Certificate Info:" -ForegroundColor Cyan
    Write-Host "  - Certificates will auto-renew every 12 hours" -ForegroundColor White
    Write-Host "  - Check certbot logs: docker-compose -f docker-compose.prod.yml logs certbot" -ForegroundColor White
    Write-Host ""
}

Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "  - If site is not accessible, check DNS propagation" -ForegroundColor White
Write-Host "  - Ensure ports 80 and 443 are forwarded to this machine" -ForegroundColor White
Write-Host "  - View detailed deployment guide: DEPLOYMENT.md" -ForegroundColor White
Write-Host ""
