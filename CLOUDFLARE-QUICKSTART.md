# 🚀 Quick Start: Cloudflare Tunnel Deployment

## Your Configuration
- **Domain**: `labface.site`
- **Tunnel**: `b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com`

## 3-Step Deployment

### Step 1: Configure DNS in Namecheap

Add CNAME records in Namecheap:

| Type  | Host | Value                                                    |
|-------|------|----------------------------------------------------------|
| CNAME | @    | b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com   |
| CNAME | www  | b7f85462-1311-47e1-b880-e5f3ef66a296.cfargotunnel.com   |

### Step 2: Set Up Environment

```powershell
# Copy template
Copy-Item .env.production .env.prod

# Edit .env.prod with strong passwords
notepad .env.prod
```

### Step 3: Deploy

```powershell
.\deploy-cloudflare.ps1
```

## Configure Cloudflare Tunnel

After deployment, configure your tunnel:

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access → Tunnels**
3. Find tunnel: `b7f85462-1311-47e1-b880-e5f3ef66a296`
4. Add **Public Hostname**:
   - **Subdomain**: `labface.site`
   - **Domain**: (leave as root)
   - **Service Type**: `HTTP`
   - **URL**: `localhost:80`

5. Add another for www:
   - **Subdomain**: `www`
   - **Domain**: `labface.site`
   - **Service Type**: `HTTP`
   - **URL**: `localhost:80`

## Access Your Site

Visit: **https://labface.site** 🎉

## Benefits

✅ No port forwarding needed  
✅ Automatic HTTPS from Cloudflare  
✅ DDoS protection included  
✅ Your home IP stays private  
✅ Global CDN performance  

## Useful Commands

```powershell
# View logs
docker-compose -f docker-compose.cloudflare.yml logs -f

# Check status
docker-compose -f docker-compose.cloudflare.yml ps

# Restart
docker-compose -f docker-compose.cloudflare.yml restart

# Stop
docker-compose -f docker-compose.cloudflare.yml down
```

## Troubleshooting

**Site not loading?**
1. Check containers: `docker-compose -f docker-compose.cloudflare.yml ps`
2. Verify Cloudflare Tunnel is configured correctly
3. Check DNS propagation: `nslookup labface.site`

**Need more help?**
See: `CLOUDFLARE-TUNNEL-DEPLOYMENT.md`
