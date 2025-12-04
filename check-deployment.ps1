# Pre-Deployment Checklist Script
# Run this before deploying to verify everything is ready

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LabFace Pre-Deployment Checklist" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: Docker
Write-Host "[1/8] Checking Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    $composeVersion = docker-compose --version
    
    # Check if Docker is running
    docker ps | Out-Null
    
    Write-Host "  ✓ Docker Desktop is installed and running" -ForegroundColor Green
    Write-Host "    $dockerVersion" -ForegroundColor Gray
    Write-Host "    $composeVersion" -ForegroundColor Gray
}
catch {
    Write-Host "  ✗ Docker Desktop is not running or not installed!" -ForegroundColor Red
    Write-Host "    Please install and start Docker Desktop" -ForegroundColor Red
    $allGood = $false
}

# Check 2: Environment file
Write-Host "[2/8] Checking environment configuration..." -ForegroundColor Yellow
if (Test-Path ".env.prod") {
    Write-Host "  ✓ .env.prod file exists" -ForegroundColor Green
    
    # Check for default passwords
    $envContent = Get-Content ".env.prod" -Raw
    if ($envContent -match "your_secure_.*_here" -or $envContent -match "your-email@example.com") {
        Write-Host "  ⚠ WARNING: .env.prod contains default values!" -ForegroundColor Yellow
        Write-Host "    Please update all passwords and email addresses" -ForegroundColor Yellow
        $allGood = $false
    }
    else {
        Write-Host "  ✓ .env.prod appears to be configured" -ForegroundColor Green
    }
}
else {
    Write-Host "  ✗ .env.prod file not found!" -ForegroundColor Red
    Write-Host "    Run: Copy-Item .env.production .env.prod" -ForegroundColor Red
    $allGood = $false
}

# Check 3: DNS Configuration
Write-Host "[3/8] Checking DNS configuration..." -ForegroundColor Yellow
try {
    $dnsResult = Resolve-DnsName -Name "labface.site" -ErrorAction SilentlyContinue
    if ($dnsResult) {
        Write-Host "  ✓ DNS is configured for labface.site" -ForegroundColor Green
        Write-Host "    Resolves to: $($dnsResult[0].IPAddress)" -ForegroundColor Gray
    }
    else {
        Write-Host "  ⚠ DNS not yet propagated for labface.site" -ForegroundColor Yellow
        Write-Host "    Configure DNS in Namecheap and wait for propagation" -ForegroundColor Yellow
        $allGood = $false
    }
}
catch {
    Write-Host "  ⚠ Could not verify DNS" -ForegroundColor Yellow
    Write-Host "    Make sure DNS is configured in Namecheap" -ForegroundColor Yellow
}

# Check 4: Public IP
Write-Host "[4/8] Checking public IP..." -ForegroundColor Yellow
try {
    $publicIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
    Write-Host "  ✓ Your public IP: $publicIP" -ForegroundColor Green
    Write-Host "    Ensure your DNS points to this IP" -ForegroundColor Gray
}
catch {
    Write-Host "  ⚠ Could not determine public IP" -ForegroundColor Yellow
}

# Check 5: Port availability
Write-Host "[5/8] Checking port availability..." -ForegroundColor Yellow
$portsToCheck = @(80, 443)
$portsOk = $true

foreach ($port in $portsToCheck) {
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($connection) {
            Write-Host "  ⚠ Port $port is already in use" -ForegroundColor Yellow
            $portsOk = $false
        }
    }
    catch {
        # Port is free (good)
    }
}

if ($portsOk) {
    Write-Host "  ✓ Ports 80 and 443 are available" -ForegroundColor Green
}
else {
    Write-Host "    Stop any services using these ports before deploying" -ForegroundColor Yellow
}

# Check 6: Required files
Write-Host "[6/8] Checking required files..." -ForegroundColor Yellow
$requiredFiles = @(
    "docker-compose.prod.yml",
    "nginx/nginx.conf",
    "nginx/Dockerfile",
    "scripts/init-ssl.ps1",
    "deploy.ps1"
)

$filesOk = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ $file is missing!" -ForegroundColor Red
        $filesOk = $false
    }
}

if (-not $filesOk) {
    $allGood = $false
}

# Check 7: Disk space
Write-Host "[7/8] Checking disk space..." -ForegroundColor Yellow
$drive = Get-PSDrive -Name C
$freeSpaceGB = [math]::Round($drive.Free / 1GB, 2)
if ($freeSpaceGB -gt 10) {
    Write-Host "  ✓ Sufficient disk space: $freeSpaceGB GB free" -ForegroundColor Green
}
else {
    Write-Host "  ⚠ Low disk space: $freeSpaceGB GB free" -ForegroundColor Yellow
    Write-Host "    Recommended: At least 10 GB free" -ForegroundColor Yellow
}

# Check 8: OpenSSL (for SSL initialization)
Write-Host "[8/8] Checking OpenSSL..." -ForegroundColor Yellow
try {
    $opensslVersion = openssl version 2>$null
    if ($opensslVersion) {
        Write-Host "  ✓ OpenSSL is installed" -ForegroundColor Green
        Write-Host "    $opensslVersion" -ForegroundColor Gray
    }
    else {
        Write-Host "  ⚠ OpenSSL not found in PATH" -ForegroundColor Yellow
        Write-Host "    SSL initialization may fail" -ForegroundColor Yellow
        Write-Host "    Install Git for Windows (includes OpenSSL)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  ⚠ OpenSSL not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "  ✓ All checks passed!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You're ready to deploy! Run:" -ForegroundColor Green
    Write-Host "  .\deploy.ps1" -ForegroundColor White
}
else {
    Write-Host "  ⚠ Some issues need attention" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Please fix the issues above before deploying." -ForegroundColor Yellow
    Write-Host "See DEPLOYMENT.md for detailed instructions." -ForegroundColor Yellow
}

Write-Host ""

# Additional reminders
Write-Host "Pre-Deployment Reminders:" -ForegroundColor Cyan
Write-Host "  1. Ensure ports 80 and 443 are forwarded to this machine" -ForegroundColor White
Write-Host "  2. Use strong, unique passwords in .env.prod" -ForegroundColor White
Write-Host "  3. Backup any existing data before deploying" -ForegroundColor White
Write-Host "  4. Have your email ready for SSL certificate notifications" -ForegroundColor White
Write-Host ""
