# LabFace Production - Quick Reference

## 🚀 Quick Deploy

```powershell
# Navigate to project directory
cd "C:\Users\John Lloyd\Capstone\LabFace"

# Run automated deployment
.\deploy.ps1
```

## 📋 Prerequisites Checklist

- [ ] Docker Desktop installed and running
- [ ] Domain `labface.site` configured in Namecheap DNS
- [ ] Ports 80 and 443 forwarded to your machine
- [ ] `.env.prod` file created and configured with secure passwords

## 🔧 Common Commands

### Start Services
```powershell
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Stop Services
```powershell
docker-compose -f docker-compose.prod.yml down
```

### View Logs
```powershell
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### Check Status
```powershell
docker-compose -f docker-compose.prod.yml ps
```

### Restart a Service
```powershell
docker-compose -f docker-compose.prod.yml restart frontend
```

### Rebuild and Restart
```powershell
docker-compose -f docker-compose.prod.yml build frontend
docker-compose -f docker-compose.prod.yml up -d frontend
```

## 🔐 SSL Certificate Management

### Manual Certificate Renewal
```powershell
docker-compose -f docker-compose.prod.yml run --rm certbot renew
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Check Certificate Expiry
```powershell
docker-compose -f docker-compose.prod.yml run --rm certbot certificates
```

## 💾 Database Operations

### Backup Database
```powershell
docker-compose -f docker-compose.prod.yml exec mariadb mysqldump -u root -p labface > backup_$(Get-Date -Format 'yyyy-MM-dd').sql
```

### Restore Database
```powershell
Get-Content backup.sql | docker-compose -f docker-compose.prod.yml exec -T mariadb mysql -u root -p labface
```

### Access Database CLI
```powershell
docker-compose -f docker-compose.prod.yml exec mariadb mysql -u root -p labface
```

## 🗂️ MinIO Operations

### Access MinIO Console
Open browser: `http://localhost:9003` (if exposed) or configure nginx to expose it

### List Buckets
```powershell
docker-compose -f docker-compose.prod.yml exec minio mc ls myminio
```

## 🐛 Troubleshooting

### Site Not Accessible
1. Check DNS: `nslookup labface.site`
2. Check containers: `docker-compose -f docker-compose.prod.yml ps`
3. Check nginx logs: `docker-compose -f docker-compose.prod.yml logs nginx`
4. Verify ports are open: Test from external network

### SSL Certificate Failed
1. Verify DNS points to your public IP
2. Check ports 80/443 are accessible from internet
3. View certbot logs: `docker-compose -f docker-compose.prod.yml logs certbot`
4. Try manual initialization: `.\scripts\init-ssl.ps1`

### Container Keeps Restarting
```powershell
# Check logs for the problematic container
docker-compose -f docker-compose.prod.yml logs [service-name]

# Check container details
docker inspect [container-id]
```

### Database Connection Issues
1. Ensure mariadb container is running
2. Check database credentials in `.env.prod`
3. Verify backend can reach database: `docker-compose -f docker-compose.prod.yml exec backend ping mariadb`

## 🔄 Update Application

```powershell
# Pull latest code (if using git)
git pull

# Rebuild images
docker-compose -f docker-compose.prod.yml build

# Restart services
docker-compose -f docker-compose.prod.yml up -d
```

## 🧹 Clean Up

### Remove All Containers and Volumes (⚠️ DESTRUCTIVE)
```powershell
docker-compose -f docker-compose.prod.yml down -v
```

### Remove Unused Images
```powershell
docker image prune -a
```

### Full Reset
```powershell
# Stop everything
docker-compose -f docker-compose.prod.yml down -v

# Remove SSL certificates
Remove-Item -Recurse -Force .\certbot

# Remove environment file
Remove-Item .env.prod

# Start fresh deployment
.\deploy.ps1
```

## 📊 Monitoring

### Check Resource Usage
```powershell
docker stats
```

### Check Disk Usage
```powershell
docker system df
```

## 🌐 URLs

- **Production Site**: https://labface.site
- **Production Site (www)**: https://www.labface.site
- **API Endpoint**: https://labface.site/api

## 📞 Support

For detailed instructions, see:
- **Full Deployment Guide**: `DEPLOYMENT.md`
- **Project README**: `README.md`

## ⚡ Quick Fixes

### Nginx Won't Start
```powershell
# Check nginx config syntax
docker-compose -f docker-compose.prod.yml exec nginx nginx -t

# Reload nginx
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Frontend Not Updating
```powershell
# Clear Next.js cache and rebuild
docker-compose -f docker-compose.prod.yml exec frontend rm -rf .next
docker-compose -f docker-compose.prod.yml restart frontend
```

### MinIO Buckets Not Created
```powershell
# Manually create buckets
docker-compose -f docker-compose.prod.yml up createbuckets
```
