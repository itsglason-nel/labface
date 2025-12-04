#!/bin/bash

# Initialize SSL certificates for labface.site
# This script should be run once before starting the production deployment

DOMAIN="labface.site"
EMAIL="your-email@example.com"  # Replace with your actual email

echo "Initializing SSL certificates for $DOMAIN..."

# Create directories
mkdir -p ./certbot/conf
mkdir -p ./certbot/www

# Download recommended TLS parameters
if [ ! -f "./certbot/conf/options-ssl-nginx.conf" ]; then
    echo "Downloading recommended TLS parameters..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "./certbot/conf/options-ssl-nginx.conf"
fi

if [ ! -f "./certbot/conf/ssl-dhparams.pem" ]; then
    echo "Downloading SSL DH parameters..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "./certbot/conf/ssl-dhparams.pem"
fi

# Create dummy certificate for initial nginx startup
echo "Creating dummy certificate for $DOMAIN..."
mkdir -p "./certbot/conf/live/$DOMAIN"

openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "./certbot/conf/live/$DOMAIN/privkey.pem" \
    -out "./certbot/conf/live/$DOMAIN/fullchain.pem" \
    -subj "/CN=$DOMAIN"

echo "Dummy certificate created."

# Start nginx with dummy certificate
echo "Starting nginx..."
docker-compose -f docker-compose.prod.yml up -d nginx

echo "Waiting for nginx to start..."
sleep 5

# Delete dummy certificate
echo "Deleting dummy certificate..."
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# Request real certificate
echo "Requesting Let's Encrypt certificate for $DOMAIN..."
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN \
    -d www.$DOMAIN" certbot

# Reload nginx
echo "Reloading nginx..."
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "SSL initialization complete!"
echo "Your site should now be accessible at https://$DOMAIN"
