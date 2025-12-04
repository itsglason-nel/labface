# LabFace Deployment Guide

This guide will help you deploy LabFace to your domain `labface.site` using Docker Desktop on Windows.

## Prerequisites

1. **Docker Desktop** installed and running on Windows
2. **Domain**: `labface.site` registered with Namecheap
3. **Public IP Address**: Your server/desktop must have a public IP address
4. **Port Forwarding**: Ports 80 and 443 forwarded to your machine
5. **OpenSSL**: Required for generating initial SSL certificates (usually included with Git for Windows)

## Step 1: Configure DNS in Namecheap

1. Log in to your Namecheap account
2. Go to Domain List → Manage for `labface.site`
3. Navigate to Advanced DNS
4. Add/Update the following DNS records:

   | Type  | Host | Value              | TTL       |
   |-------|------|--------------------|-----------|
   | A     | @    | YOUR_PUBLIC_IP     | Automatic |
   | A     | www  | YOUR_PUBLIC_IP     | Automatic |

5. Wait for DNS propagation (can take 5-30 minutes)

**To find your public IP:**
```powershell
(Invoke-WebRequest -Uri "https://api.ipify.org").Content
```

## Step 2: Configure Port Forwarding

If you're behind a router, you need to forward ports 80 and 443 to your machine:

1. Access your router's admin panel (usually at 192.168.1.1 or 192.168.0.1)
2. Find Port Forwarding settings
3. Add rules to forward:
   - External Port 80 → Internal IP (your machine) Port 80
   - External Port 443 → Internal IP (your machine) Port 443

## Step 3: Update Production Environment Variables

1. Copy `.env.production` to `.env.prod`:
   ```powershell
   Copy-Item .env.production .env.prod
   ```

2. Edit `.env.prod` and update the following values:
   ```env
   DB_ROOT_PASSWORD=your_secure_root_password_here
   DB_PASSWORD=your_secure_db_password_here
   MINIO_ACCESS_KEY=your_minio_access_key_here
   MINIO_SECRET_KEY=your_minio_secret_key_here
   CERTBOT_EMAIL=your-email@example.com
   ```

   **Important**: Use strong, unique passwords for production!

## Step 4: Update SSL Initialization Script

Edit `scripts\init-ssl.ps1` and update the email address:
```powershell
$EMAIL = "glasonnel.duenasgarganta@gmail.com"  # Replace with your actual email
```

This email will be used by Let's Encrypt for certificate expiration notifications.

## Step 5: Build and Start Services

1. Navigate to the project directory:
   ```powershell
   cd "C:\Users\John Lloyd\Capstone\LabFace"
   ```

2. Build the Docker images:
   ```powershell
   docker-compose -f docker-compose.prod.yml build
   ```

3. Start the database and MinIO first:
   ```powershell
   docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d mariadb minio createbuckets
   ```

4. Wait for services to initialize (about 30 seconds):
   ```powershell
   Start-Sleep -Seconds 30
   ```

5. Start the application services:
   ```powershell
   docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d backend ai-service frontend
   ```

## Step 6: Initialize SSL Certificates

Run the SSL initialization script:
```powershell
.\scripts\init-ssl.ps1
```

This script will:
1. Create necessary directories
2. Download TLS parameters
3. Generate a temporary self-signed certificate
4. Start Nginx
5. Request a real certificate from Let's Encrypt
6. Reload Nginx with the real certificate

**Note**: This step will only work if:
- Your DNS is properly configured and propagated
- Ports 80 and 443 are accessible from the internet
- Your email is valid

## Step 7: Verify Deployment

1. Check if all containers are running:
   ```powershell
   docker-compose -f docker-compose.prod.yml ps
   ```

2. Check logs for any errors:
   ```powershell
   docker-compose -f docker-compose.prod.yml logs -f
   ```

3. Visit your site:
   - https://labface.site
   - https://www.labface.site

## Troubleshooting

### DNS Not Resolving
```powershell
# Check DNS propagation
nslookup labface.site
```
Wait for DNS to propagate (up to 48 hours, usually much faster).

### SSL Certificate Failed
If Let's Encrypt fails, check:
1. DNS is properly configured
2. Ports 80 and 443 are accessible
3. No firewall blocking connections

View certbot logs:
```powershell
docker-compose -f docker-compose.prod.yml logs certbot
```

### Container Not Starting
Check individual container logs:
```powershell
docker-compose -f docker-compose.prod.yml logs frontend
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs nginx
```

### Reset and Start Over
```powershell
# Stop all containers
docker-compose -f docker-compose.prod.yml down

# Remove volumes (WARNING: This deletes all data!)
docker-compose -f docker-compose.prod.yml down -v

# Remove SSL certificates
Remove-Item -Recurse -Force .\certbot

# Start from Step 5
```

## Maintenance

### Renewing SSL Certificates
Certificates auto-renew via the certbot container. To manually renew:
```powershell
docker-compose -f docker-compose.prod.yml run --rm certbot renew
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Viewing Logs
```powershell
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f frontend
```

### Updating the Application
```powershell
# Pull latest changes (if using git)
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Backup Database
```powershell
docker-compose -f docker-compose.prod.yml exec mariadb mysqldump -u root -p labface > backup.sql
```

### Restore Database
```powershell
Get-Content backup.sql | docker-compose -f docker-compose.prod.yml exec -T mariadb mysql -u root -p labface
```

## Security Recommendations

1. **Change Default Passwords**: Never use default passwords in production
2. **Firewall**: Only expose ports 80 and 443
3. **Regular Updates**: Keep Docker images updated
4. **Backups**: Regularly backup your database and MinIO data
5. **Monitoring**: Set up monitoring and alerting
6. **Rate Limiting**: Nginx config includes rate limiting
7. **HTTPS Only**: All traffic is redirected to HTTPS

## Production Checklist

- [ ] DNS configured and propagated
- [ ] Ports 80 and 443 forwarded
- [ ] Strong passwords set in `.env.prod`
- [ ] Email configured for SSL certificates
- [ ] All containers running without errors
- [ ] HTTPS working correctly
- [ ] Database initialized with schema
- [ ] MinIO buckets created
- [ ] Application accessible at https://labface.site
- [ ] Backup strategy in place

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review container logs
3. Verify DNS and network configuration
4. Ensure all prerequisites are met
