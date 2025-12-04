# LabFace Deployment with Cloudflare Tunnel

## Overview

You're using Cloudflare Tunnel to expose your local Docker deployment to the internet. This is excellent because:
- ✅ No need to open ports 80/443 on your router
- ✅ No need for port forwarding
- ✅ Built-in DDoS protection from Cloudflare
- ✅ Automatic SSL/TLS encryption
- ✅ Your home IP remains private

## Your Configuration

**Domain**: `labface.site`  
**Tunnel ID**: `b7f85462-1311-47e1-b880-e5f3ef66a296`  
**Tunnel Hostname**: `b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com`

## DNS Configuration in Namecheap

Since you're using Cloudflare Tunnel, you need to set up a **CNAME record** instead of A records:

### In Namecheap DNS Settings:

1. Go to Namecheap → Domain List → Manage `labface.site`
2. Navigate to **Advanced DNS**
3. Add the following DNS records:

| Type  | Host | Value                                                    | TTL       |
|-------|------|----------------------------------------------------------|-----------|
| CNAME | @    | b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com   | Automatic |
| CNAME | www  | b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com   | Automatic |

**Note**: Some DNS providers don't allow CNAME for the root domain (@). If Namecheap doesn't allow this, you have two options:
1. Use Cloudflare's nameservers (recommended)
2. Use CNAME flattening if Namecheap supports it

## Simplified Deployment (No SSL Setup Needed!)

Since Cloudflare Tunnel handles SSL/TLS automatically, you don't need:
- ❌ Let's Encrypt certificates
- ❌ Certbot
- ❌ Nginx for SSL termination
- ❌ Port 80/443 exposure

### Updated Docker Compose for Cloudflare Tunnel

I'll create a simplified version that works with Cloudflare Tunnel.

## Deployment Steps

### Step 1: Configure Environment Variables

```powershell
# Copy template
Copy-Item .env.production .env.prod

# Edit .env.prod and set:
# - DB_ROOT_PASSWORD (strong password)
# - DB_PASSWORD (strong password)
# - MINIO_ACCESS_KEY (strong key)
# - MINIO_SECRET_KEY (strong key)
```

### Step 2: Start Your Application

```powershell
# Use the Cloudflare Tunnel version
docker-compose -f docker-compose.cloudflare.yml --env-file .env.prod up -d
```

### Step 3: Configure Cloudflare Tunnel

You need to configure your Cloudflare Tunnel to route traffic to your local services.

#### Option A: Using Cloudflare Dashboard

1. Go to Cloudflare Zero Trust Dashboard
2. Navigate to Access → Tunnels
3. Find your tunnel: `b7f85462-1311-47e1-b880-e5f3ef66a296`
4. Configure Public Hostname:
   - **Public hostname**: `labface.site` and `www.labface.site`
   - **Service**: `http://nginx:80` (or `http://localhost:80` if running locally)

#### Option B: Using cloudflared CLI

If you have `cloudflared` installed locally, you can configure it via config file.

## Cloudflare Tunnel Configuration

Your tunnel should route:
- `labface.site` → `http://localhost:80` (or `http://nginx:80`)
- `www.labface.site` → `http://localhost:80` (or `http://nginx:80`)

Cloudflare will automatically:
- Provide SSL/TLS certificates
- Handle HTTPS encryption
- Provide DDoS protection
- Cache static assets (if configured)

## Architecture with Cloudflare Tunnel

```
Internet
    ↓
Cloudflare Edge (SSL/TLS termination)
    ↓
Cloudflare Tunnel (encrypted tunnel)
    ↓
Your Local Machine
    ↓
Nginx (reverse proxy, HTTP only)
    ↓
┌─────────────────────────────┐
│ Frontend (Next.js)          │
│ Backend (Node.js)           │
│ AI Service (Python)         │
│ MariaDB (Database)          │
│ MinIO (Object Storage)      │
└─────────────────────────────┘
```

## Benefits of This Setup

1. **No Port Forwarding**: Your router doesn't need any configuration
2. **Private IP**: Your home IP address stays hidden
3. **Automatic SSL**: Cloudflare handles all SSL/TLS
4. **DDoS Protection**: Built-in protection from Cloudflare
5. **Global CDN**: Content delivered from Cloudflare's edge network
6. **Easy Setup**: No need to manage SSL certificates

## Troubleshooting

### DNS Not Resolving
```powershell
nslookup labface.site
```
Should show the Cloudflare Tunnel CNAME.

### Tunnel Not Working
1. Check if cloudflared is running
2. Verify tunnel configuration in Cloudflare dashboard
3. Ensure your local services are accessible

### Application Not Loading
1. Check Docker containers: `docker-compose -f docker-compose.cloudflare.yml ps`
2. Check logs: `docker-compose -f docker-compose.cloudflare.yml logs -f`
3. Verify Cloudflare Tunnel is routing to correct local port

## Next Steps

1. ✅ Configure CNAME records in Namecheap
2. ✅ Set up `.env.prod` with secure passwords
3. ✅ Deploy using `docker-compose.cloudflare.yml`
4. ✅ Configure Cloudflare Tunnel routing
5. ✅ Visit https://labface.site

Your site will be live with automatic HTTPS! 🎉
