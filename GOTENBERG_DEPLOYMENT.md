# Gotenberg Deployment Guide

This guide walks you through deploying Gotenberg for PDF generation in VerifyTrade.

## Quick Start

### 1. Deploy Gotenberg Service

Choose one of the following deployment options:

#### Option A: Render.com (Recommended)

1. Create a `Dockerfile` in a new repository:

```dockerfile
FROM gotenberg/gotenberg:8

# Configure Gotenberg
ENV CHROMIUM_AUTO_START=true
ENV CHROMIUM_MAX_QUEUE_SIZE=50

EXPOSE 3000
```

2. Create `render.yaml`:

```yaml
services:
  - type: web
    name: gotenberg-pdf
    env: docker
    dockerfilePath: Dockerfile
    autoDeploy: true
    healthCheckPath: /health
    plan: starter
    region: oregon
    envVars:
      - key: GOTENBERG_CHROMIUM_AUTO_START
        value: "true"
      - key: GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE
        value: "50"
```

3. Connect repository to Render.com
4. Note the service URL (e.g., `https://gotenberg-pdf.onrender.com`)

#### Option B: Railway.app

1. Create a new project on Railway.app
2. Select "Deploy from Docker Image"
3. Use image: `gotenberg/gotenberg:8`
4. Set port: `3000`
5. Add environment variables:
   - `GOTENBERG_CHROMIUM_AUTO_START=true`
   - `GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50`
6. Deploy and note the public URL

#### Option C: Google Cloud Run

```bash
# Deploy container
gcloud run deploy gotenberg \
  --image=gotenberg/gotenberg:8 \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --set-env-vars="GOTENBERG_CHROMIUM_AUTO_START=true,GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50"
```

#### Option D: Self-Hosted (Docker)

```bash
# Run Gotenberg container
docker run -d \
  --name gotenberg \
  --restart=unless-stopped \
  -p 3000:3000 \
  -e GOTENBERG_CHROMIUM_AUTO_START=true \
  -e GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50 \
  gotenberg/gotenberg:8

# Make accessible via reverse proxy (Nginx/Caddy/Traefik)
```

### 2. Configure Supabase Edge Function

```bash
# Set the Gotenberg URL in Supabase
supabase secrets set GOTENBERG_URL=https://your-gotenberg-domain

# Deploy the edge function
supabase functions deploy generate_pdf_gotenberg
```

### 3. Update Local Environment

Add to `.env` for local development:

```bash
GOTENBERG_URL=https://your-gotenberg-domain
```

### 4. Test the Service

```bash
# Test Gotenberg directly
curl https://your-gotenberg-domain/health

# Expected response:
# {"status":"up"}
```

## Production Configuration

### Recommended Resources

| Deployment | CPU | Memory | Concurrent PDFs |
|------------|-----|--------|-----------------|
| Development | 1 core | 1GB | 5 |
| Production (small) | 2 cores | 2GB | 20 |
| Production (medium) | 4 cores | 4GB | 50 |
| Production (large) | 8 cores | 8GB | 100 |

### Gotenberg Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `GOTENBERG_CHROMIUM_AUTO_START` | `true` | Pre-start Chromium instances |
| `GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE` | `50` | Max concurrent conversions |
| `GOTENBERG_CHROMIUM_IGNORE_CERTIFICATE_ERRORS` | `true` | Ignore SSL errors (dev only) |
| `GOTENBERG_LOG_LEVEL` | `INFO` | Logging verbosity |

### Security Considerations

#### 1. Authentication

The edge function handles authentication - **never expose Gotenberg directly to the internet without authentication**.

#### 2. Rate Limiting

Add rate limiting in your infrastructure:

**Nginx example:**
```nginx
limit_req_zone $binary_remote_addr zone=pdf:10m rate=10r/m;

location / {
    limit_req zone=pdf burst=5 nodelay;
    proxy_pass http://gotenberg:3000;
}
```

**Cloudflare example:**
- Add a rate limiting rule: 10 requests per minute per IP

#### 3. Network Security

- Deploy Gotenberg in a private network
- Only allow access from Supabase edge function IPs
- Use HTTPS/TLS for all communication

### Monitoring

#### Health Check Endpoint

```bash
curl https://your-gotenberg-domain/health
```

Response:
```json
{"status":"up"}
```

#### Metrics to Monitor

1. **Response Time**: Should be < 10 seconds for typical reports
2. **Error Rate**: Should be < 1%
3. **Queue Size**: Monitor Chromium queue size
4. **Memory Usage**: Alert if > 80% of allocated memory
5. **CPU Usage**: Alert if > 90% for sustained periods

#### Recommended Monitoring Setup

**Uptime Monitoring:**
- Use UptimeRobot, Pingdom, or similar
- Check `/health` endpoint every 5 minutes
- Alert if down for > 2 checks

**Application Monitoring:**
- Log all PDF generation requests in edge function
- Track success/failure rates
- Monitor generation times

## Troubleshooting

### Problem: "GOTENBERG_URL not set" error

**Solution:**
```bash
# Check if secret is set
supabase secrets list

# If not present, set it
supabase secrets set GOTENBERG_URL=https://your-gotenberg-domain

# Redeploy edge function
supabase functions deploy generate_pdf_gotenberg
```

### Problem: Timeouts during PDF generation

**Causes & Solutions:**

1. **Insufficient resources**
   - Scale up: Increase CPU/memory allocation
   - Scale out: Add more Gotenberg instances with load balancer

2. **Large/complex HTML**
   - Optimize HTML: Remove unnecessary elements
   - Compress images: Use smaller, optimized images
   - Simplify CSS: Remove unused styles

3. **Network latency**
   - Deploy Gotenberg closer to Supabase edge functions
   - Use same cloud provider/region

### Problem: PDF layout doesn't match expectations

**Solutions:**

1. **Test HTML locally**
   ```bash
   # Save HTML to file
   echo '<html>...</html>' > test.html

   # Test with Gotenberg
   curl --form files=@test.html \
        --form paperWidth=8.27 \
        --form paperHeight=11.69 \
        --form printBackground=true \
        https://your-gotenberg-domain/forms/chromium/convert/html \
        --output test.pdf
   ```

2. **Check print preview in browser**
   - Open HTML in Chrome
   - Press Ctrl+P (Cmd+P on Mac)
   - Check print preview
   - Verify page breaks, margins, colors

3. **Validate CSS**
   - Ensure all CSS is inline or in `<style>` tags
   - Use print-safe CSS (see `pdfStyles.ts`)
   - Test with minimal HTML first

### Problem: "Chromium failed to start" errors

**Solutions:**

1. **Check memory allocation**: Chromium needs at least 512MB RAM
2. **Verify environment variables**: Ensure `GOTENBERG_CHROMIUM_AUTO_START=true`
3. **Check logs**: Review container logs for Chromium crashes
4. **Restart service**: Sometimes Chromium gets into a bad state

### Problem: Slow first request

**Cause:** Chromium cold start

**Solutions:**
1. Enable `GOTENBERG_CHROMIUM_AUTO_START=true`
2. Implement health check probing (keeps Chromium warm)
3. Use a CDN or load balancer with keepalive connections

## Cost Optimization

### Render.com Pricing

| Plan | CPU | Memory | Cost/Month | Suitable For |
|------|-----|--------|------------|--------------|
| Starter | 0.5 cores | 512MB | $7 | Development/Testing |
| Standard | 1 core | 2GB | $25 | Production (small) |
| Pro | 2 cores | 4GB | $85 | Production (medium) |
| Pro Plus | 4 cores | 8GB | $275 | Production (large) |

### Railway.app Pricing

- Pay-per-use: ~$0.000231 per GB-hour
- Average cost: $15-50/month for typical usage

### Google Cloud Run Pricing

- Pay-per-request pricing
- First 2 million requests free per month
- After that: $0.40 per million requests
- Very cost-effective for moderate usage

### Self-Hosted

- VPS: $5-20/month (DigitalOcean, Linode, Vultr)
- Maintenance time
- Best for high volume or specific compliance needs

## Scaling

### Horizontal Scaling

For high volume, deploy multiple Gotenberg instances behind a load balancer:

```yaml
# docker-compose.yml
version: '3'

services:
  gotenberg-1:
    image: gotenberg/gotenberg:8
    environment:
      - GOTENBERG_CHROMIUM_AUTO_START=true
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'

  gotenberg-2:
    image: gotenberg/gotenberg:8
    environment:
      - GOTENBERG_CHROMIUM_AUTO_START=true
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'

  nginx:
    image: nginx:alpine
    ports:
      - "3000:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - gotenberg-1
      - gotenberg-2
```

```nginx
# nginx.conf
upstream gotenberg {
    least_conn;
    server gotenberg-1:3000 max_fails=3 fail_timeout=30s;
    server gotenberg-2:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;

    location / {
        proxy_pass http://gotenberg;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Increase timeout for large PDFs
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

### Vertical Scaling

For complex PDFs, increase resources:

```bash
# Render.com: Upgrade plan via dashboard
# Railway: Adjust resources in project settings
# Docker: Update resource limits

docker run -d \
  --name gotenberg \
  --memory=4g \
  --cpus=4 \
  gotenberg/gotenberg:8
```

## Migration Checklist

- [ ] Deploy Gotenberg service
- [ ] Verify health endpoint (`/health`)
- [ ] Set `GOTENBERG_URL` in Supabase secrets
- [ ] Deploy `generate_pdf_gotenberg` edge function
- [ ] Update `.env` for local development
- [ ] Test PDF generation with sample report
- [ ] Verify PDF layout and formatting
- [ ] Check header/footer rendering
- [ ] Test fallback to HTM export
- [ ] Set up monitoring/alerting
- [ ] Document production URL for team
- [ ] Remove old `generate_pdf_docraptor` edge function (optional)

## Support Resources

- **Gotenberg Documentation**: https://gotenberg.dev/docs/getting-started/introduction
- **Gotenberg GitHub**: https://github.com/gotenberg/gotenberg
- **Chromium Print Options**: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF
- **CSS Print Reference**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing

## Example: Full Production Setup

Here's a complete production setup using Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'

services:
  gotenberg:
    image: gotenberg/gotenberg:8
    container_name: gotenberg-pdf
    restart: unless-stopped
    environment:
      - GOTENBERG_CHROMIUM_AUTO_START=true
      - GOTENBERG_CHROMIUM_MAX_QUEUE_SIZE=50
      - GOTENBERG_LOG_LEVEL=INFO
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4'
        reservations:
          memory: 2G
          cpus: '2'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - internal

  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    restart: unless-stopped
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - gotenberg
    networks:
      - internal
      - external

networks:
  internal:
    internal: true
  external:
```

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    limit_req_zone $binary_remote_addr zone=pdf:10m rate=20r/m;

    upstream gotenberg_backend {
        server gotenberg:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 443 ssl http2;
        server_name pdf.yourdomain.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        location / {
            limit_req zone=pdf burst=10 nodelay;

            proxy_pass http://gotenberg_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
            proxy_send_timeout 300s;

            client_max_body_size 50M;
        }

        location /health {
            proxy_pass http://gotenberg_backend/health;
            access_log off;
        }
    }

    server {
        listen 80;
        server_name pdf.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }
}
```

Deploy with:

```bash
docker-compose up -d
```

Then set in Supabase:

```bash
supabase secrets set GOTENBERG_URL=https://pdf.yourdomain.com
```
