# 🚀 LabFace Deployment Summary

## What We've Set Up

Your LabFace application is now ready for production deployment to **labface.site** using Docker Desktop on Windows!

### 📁 New Files Created

1. **nginx/nginx.conf** - Nginx reverse proxy configuration with SSL support
2. **nginx/Dockerfile** - Nginx container configuration
3. **docker-compose.prod.yml** - Production Docker Compose configuration
4. **.env.production** - Production environment variables template
5. **scripts/init-ssl.ps1** - PowerShell script for SSL certificate initialization
6. **scripts/init-ssl.sh** - Bash script for SSL certificate initialization (Linux/Mac)
7. **deploy.ps1** - Automated deployment script
8. **.gitignore** - Git ignore rules for sensitive files
9. **DEPLOYMENT.md** - Comprehensive deployment guide
10. **PRODUCTION-GUIDE.md** - Quick reference for common operations

### 🏗️ Architecture

```
Internet (Port 80/443)
        ↓
    Nginx (Reverse Proxy + SSL)
        ↓
    ┌───────────────────────────┐
    │   Frontend (Next.js)      │ → Port 3000
    │   Backend (Node.js)       │ → Port 5000
    │   AI Service (Python)     │ → Port 8000
    │   MariaDB (Database)      │ → Port 3306
    │   MinIO (Object Storage)  │ → Port 9000
    └───────────────────────────┘
```

### 🔐 Security Features

✅ **HTTPS/SSL** - Automatic SSL certificates via Let's Encrypt
✅ **Security Headers** - HSTS, X-Frame-Options, XSS Protection
✅ **Rate Limiting** - Protection against abuse
✅ **HTTPS Redirect** - All HTTP traffic redirected to HTTPS
✅ **TLS 1.2/1.3** - Modern encryption protocols

### 🎯 Quick Start (3 Steps)

#### Step 1: Configure DNS
Point your Namecheap domain to your public IP:
- Go to Namecheap → Domain List → Manage → Advanced DNS
- Add A records for `@` and `www` pointing to your public IP

#### Step 2: Update Environment Variables
```powershell
# Copy template
Copy-Item .env.production .env.prod

# Edit .env.prod and set:
# - DB_ROOT_PASSWORD (strong password)
# - DB_PASSWORD (strong password)
# - MINIO_ACCESS_KEY (strong key)
# - MINIO_SECRET_KEY (strong key)
# - CERTBOT_EMAIL (your email)
```

#### Step 3: Deploy
```powershell
# Run automated deployment
.\deploy.ps1
```

That's it! Your site will be live at **https://labface.site** 🎉

### 📋 Pre-Deployment Checklist

Before running the deployment:

- [ ] **Docker Desktop** is installed and running
- [ ] **DNS configured** in Namecheap (A records for @ and www)
- [ ] **Ports forwarded** (80 and 443) to your machine
- [ ] **.env.prod created** with secure passwords
- [ ] **Email configured** for SSL certificate notifications
- [ ] **Public IP** is static or using DDNS

### 🔄 Deployment Process

The `deploy.ps1` script will automatically:

1. ✅ Check Docker installation
2. ✅ Verify DNS configuration
3. ✅ Build Docker images
4. ✅ Start database and MinIO
5. ✅ Create storage buckets
6. ✅ Start application services
7. ✅ Initialize SSL certificates
8. ✅ Start Nginx with HTTPS

### 🌐 What Gets Deployed

| Service | Purpose | Access |
|---------|---------|--------|
| **Nginx** | Reverse proxy + SSL | Ports 80, 443 |
| **Frontend** | Next.js web app | Via Nginx at / |
| **Backend** | Node.js API | Via Nginx at /api |
| **AI Service** | Face recognition | Internal only |
| **MariaDB** | Database | Internal only |
| **MinIO** | File storage | Internal only |
| **Certbot** | SSL renewal | Runs every 12h |

### 📖 Documentation

- **DEPLOYMENT.md** - Full step-by-step deployment guide
- **PRODUCTION-GUIDE.md** - Quick reference for operations
- **README.md** - Project overview

### 🆘 Common Issues & Solutions

#### DNS Not Resolving
```powershell
# Check DNS propagation
nslookup labface.site
```
Wait up to 48 hours for full propagation (usually much faster).

#### SSL Certificate Failed
- Ensure DNS points to your public IP
- Verify ports 80 and 443 are accessible from internet
- Check certbot logs: `docker-compose -f docker-compose.prod.yml logs certbot`

#### Site Not Accessible
- Check all containers are running: `docker-compose -f docker-compose.prod.yml ps`
- View logs: `docker-compose -f docker-compose.prod.yml logs -f`
- Verify firewall allows ports 80 and 443

### 🔧 Useful Commands

```powershell
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# Check container status
docker-compose -f docker-compose.prod.yml ps

# Restart a service
docker-compose -f docker-compose.prod.yml restart frontend

# Stop everything
docker-compose -f docker-compose.prod.yml down

# Backup database
docker-compose -f docker-compose.prod.yml exec mariadb mysqldump -u root -p labface > backup.sql
```

### 🎉 After Deployment

Once deployed, you can access:
- **Main Site**: https://labface.site
- **With WWW**: https://www.labface.site
- **API**: https://labface.site/api

### 🔄 Updates & Maintenance

To update your application:
```powershell
# Pull latest code
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

SSL certificates will automatically renew every 12 hours via the certbot container.

### 💡 Tips

1. **Use strong passwords** in `.env.prod` - never use defaults in production
2. **Backup regularly** - especially the database and MinIO data
3. **Monitor logs** - check for errors regularly
4. **Keep Docker updated** - update Docker Desktop periodically
5. **Test locally first** - use `docker-compose.yml` for development

### 📞 Need Help?

Refer to:
- **DEPLOYMENT.md** for detailed instructions
- **PRODUCTION-GUIDE.md** for quick commands
- Container logs for troubleshooting

---

**Ready to deploy?** Run `.\deploy.ps1` and follow the prompts! 🚀
