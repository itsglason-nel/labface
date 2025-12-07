# LabFace Cloudflare Tunnel Deployment Script

param(
    [Parameter(Mandatory = $false)]
    [switch]$SkipChecks = $false
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LabFace Cloudflare Tunnel Deployment" -ForegroundColor Cyan
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

# Load environment variables from .env.prod
if (Test-Path ".env.prod") {
    Write-Host "Loading environment variables from .env.prod..." -ForegroundColor Gray
    Get-Content .env.prod | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# Check Docker
if (-not $SkipChecks) {
    Write-Host "Checking Docker..." -ForegroundColor Yellow
    try {
        docker --version | Out-Null
        docker-compose --version | Out-Null
        Write-Host "[OK] Docker is installed" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] Docker is not installed or not running!" -ForegroundColor Red
        Write-Host "Please install Docker Desktop and ensure it's running." -ForegroundColor Red
        exit 1
    }
}

# Check for Tunnel Token
if (-not $env:TUNNEL_TOKEN) {
    Write-Host "Cloudflare Tunnel Token is required." -ForegroundColor Yellow
    $env:TUNNEL_TOKEN = Read-Host "Please enter your Cloudflare Tunnel Token"
    if (-not $env:TUNNEL_TOKEN) {
        Write-Host "Error: Tunnel Token is required!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Cloudflare Tunnel Configuration:" -ForegroundColor Cyan
Write-Host "  Domain: labface.site" -ForegroundColor White
Write-Host "  Tunnel: b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com" -ForegroundColor White
Write-Host ""
Write-Host "Make sure you have configured:" -ForegroundColor Yellow
Write-Host "  1. CNAME record in Namecheap DNS" -ForegroundColor White
Write-Host "  2. Public hostname in Cloudflare Tunnel dashboard" -ForegroundColor White
Write-Host ""

$continue = Read-Host "Continue with deployment? (yes/no)"
if ($continue -ne "yes") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host ""

# Stop existing containers
Write-Host "[1/5] Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloudflare.yml down 2>$null

# Build images
Write-Host "[2/5] Building Docker images..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloudflare.yml build

# Start database and MinIO
Write-Host "[3/5] Starting database and MinIO..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloudflare.yml --env-file .env.prod up -d mariadb minio

Write-Host "Waiting for database to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 15

# Create buckets
Write-Host "[4/5] Creating MinIO buckets..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloudflare.yml --env-file .env.prod up -d createbuckets
Start-Sleep -Seconds 10

# Start application services
Write-Host "[5/5] Starting application services and tunnel..." -ForegroundColor Yellow
docker-compose -f docker-compose.cloudflare.yml --env-file .env.prod up -d backend ai-service frontend nginx tunnel

Write-Host "Waiting for services to start..." -ForegroundColor Gray
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Check container status
Write-Host "Container Status:" -ForegroundColor Cyan
docker-compose -f docker-compose.cloudflare.yml ps

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Configure Cloudflare Tunnel to route to http://nginx:80" -ForegroundColor White
Write-Host "  2. Visit https://labface.site to access your application" -ForegroundColor White
Write-Host "  3. Check logs: docker-compose -f docker-compose.cloudflare.yml logs -f" -ForegroundColor White
Write-Host ""

Write-Host "Cloudflare Tunnel Setup:" -ForegroundColor Cyan
Write-Host "  - Go to Cloudflare Zero Trust Dashboard" -ForegroundColor White
Write-Host "  - Navigate to Access -> Tunnels" -ForegroundColor White
Write-Host "  - Configure public hostname: labface.site -> http://nginx:80" -ForegroundColor White
Write-Host ""

Write-Host "DNS Configuration:" -ForegroundColor Cyan
Write-Host "  In Namecheap, add CNAME records:" -ForegroundColor White
Write-Host "  - @ -> b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com" -ForegroundColor White
Write-Host "  - www -> b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com" -ForegroundColor White
Write-Host ""

Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "  - Check container logs: docker-compose -f docker-compose.cloudflare.yml logs -f" -ForegroundColor White
Write-Host "  - Verify Cloudflare Tunnel is running and configured" -ForegroundColor White
Write-Host "  - View detailed guide: CLOUDFLARE-TUNNEL-DEPLOYMENT.md" -ForegroundColor White
Write-Host ""
