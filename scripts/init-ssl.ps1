# PowerShell script to initialize SSL certificates for labface.site
# This script should be run once before starting the production deployment

$DOMAIN = "labface.site"
$EMAIL = "your-email@example.com"  # Replace with your actual email

Write-Host "Initializing SSL certificates for $DOMAIN..." -ForegroundColor Green

# Create directories
New-Item -ItemType Directory -Force -Path ".\certbot\conf" | Out-Null
New-Item -ItemType Directory -Force -Path ".\certbot\www" | Out-Null

# Download recommended TLS parameters
if (-not (Test-Path ".\certbot\conf\options-ssl-nginx.conf")) {
    Write-Host "Downloading recommended TLS parameters..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf" -OutFile ".\certbot\conf\options-ssl-nginx.conf"
}

if (-not (Test-Path ".\certbot\conf\ssl-dhparams.pem")) {
    Write-Host "Downloading SSL DH parameters..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem" -OutFile ".\certbot\conf\ssl-dhparams.pem"
}

# Create dummy certificate for initial nginx startup
Write-Host "Creating dummy certificate for $DOMAIN..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path ".\certbot\conf\live\$DOMAIN" | Out-Null

# Generate self-signed certificate using OpenSSL (requires OpenSSL to be installed)
$opensslPath = "openssl"  # Assumes OpenSSL is in PATH
& $opensslPath req -x509 -nodes -newkey rsa:2048 -days 1 `
    -keyout ".\certbot\conf\live\$DOMAIN\privkey.pem" `
    -out ".\certbot\conf\live\$DOMAIN\fullchain.pem" `
    -subj "/CN=$DOMAIN"

Write-Host "Dummy certificate created." -ForegroundColor Green

# Start nginx with dummy certificate
Write-Host "Starting nginx..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d nginx

Write-Host "Waiting for nginx to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Delete dummy certificate
Write-Host "Deleting dummy certificate..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$DOMAIN && rm -rf /etc/letsencrypt/archive/$DOMAIN && rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# Request real certificate
Write-Host "Requesting Let's Encrypt certificate for $DOMAIN..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot --email $EMAIL --agree-tos --no-eff-email -d $DOMAIN -d www.$DOMAIN" certbot

# Reload nginx
Write-Host "Reloading nginx..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload

Write-Host "SSL initialization complete!" -ForegroundColor Green
Write-Host "Your site should now be accessible at https://$DOMAIN" -ForegroundColor Cyan
