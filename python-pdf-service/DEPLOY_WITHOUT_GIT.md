# Deploy Python Service Without Git

If you can't use git, here are alternative deployment methods:

## Method 1: Render Web Dashboard (Easiest - No Git Required)

### Step 1: Create a ZIP file

1. Navigate to the `python-pdf-service` folder
2. Select all files EXCEPT:
   - `.git` folder (if exists)
   - `__pycache__` folders
   - `.env` file (create on Render instead)
3. Create a ZIP file named `pdf-parser-service.zip`

### Step 2: Deploy to Render

1. Go to https://dashboard.render.com/select-repo
2. Click **"+ New"** → **"Web Service"**
3. Instead of connecting Git, look for **"Public Git Repository"** or **"Deploy from Docker"**
4. Since Render requires Git, use **Railway.app** instead (see Method 2)

## Method 2: Railway.app (No Git Required)

Railway.app allows deployment without Git integration.

### Step 1: Sign up

1. Go to https://railway.app
2. Sign up (free tier available)

### Step 2: Deploy

1. Click **"New Project"**
2. Click **"Deploy from GitHub repo"** or **"Empty Project"**
3. If you choose "Empty Project":
   - Click **"+ New"** → **"Empty Service"**
   - Go to Settings → Change name to `pdf-parser-ensemble`
4. Click **"Settings"** tab
5. Under **"Deploy"**, you can upload files directly

### Step 3: Configure

Add environment variables in Railway dashboard:
- `API_KEY`: Generate random string (use password generator)
- `PORT`: `5000`

### Step 4: Deploy Command

Railway will auto-detect Python. If not, add these to Settings:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --bind 0.0.0.0:$PORT --workers 4 --timeout 120 app:app`

### Step 5: Get URL

After deployment, Railway will give you a URL like:
`https://pdf-parser-ensemble-production.up.railway.app`

## Method 3: Deploy to Render via CLI (Without Git)

If you have Node.js installed:

```bash
# Install Render CLI
npm install -g @render-com/cli

# Login
render login

# Deploy from current directory
cd python-pdf-service
render deploy
```

## Method 4: Use Docker + Any Cloud Platform

If you have Docker installed locally:

### Build Docker Image

```bash
cd python-pdf-service

# Build
docker build -t pdf-parser-service .

# Test locally
docker run -p 5000:5000 -e API_KEY=test-key pdf-parser-service

# Test it works
curl http://localhost:5000/health
```

### Deploy to Various Platforms

Once you have the Docker image, you can deploy to:

**A) Render.com**
- New → Web Service
- Runtime: Docker
- Upload Dockerfile

**B) Google Cloud Run**
```bash
gcloud run deploy pdf-parser --source .
```

**C) AWS App Runner**
- Console → App Runner → Create Service
- Source: Docker image
- Upload your image

**D) DigitalOcean App Platform**
- Apps → Create App
- Source: Dockerfile
- Point to your Dockerfile

## Method 5: Direct File Upload Services

### A) Fly.io (Recommended if Docker works)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app
cd python-pdf-service
fly launch

# It will detect the Dockerfile and deploy
```

### B) Replit Deployment

1. Go to https://replit.com
2. Create new Repl → Import from GitHub OR Upload files
3. Upload all files from `python-pdf-service`
4. Click "Run"
5. Replit will auto-detect Flask and run it
6. Get your public URL from the output

## Method 6: Use My Pre-Made Docker Image (Fastest)

I can provide you with a ready-to-use Docker command:

```bash
# Run this anywhere Docker is installed
docker run -d \
  -p 5000:5000 \
  -e API_KEY=your-secret-key \
  --name pdf-parser \
  python:3.11-slim \
  /bin/bash -c "
    pip install flask flask-cors pdfplumber PyMuPDF pytesseract Pillow pdf2image boto3 python-dotenv gunicorn werkzeug && \
    # Copy your files here or mount volume
    gunicorn --bind 0.0.0.0:5000 app:app
  "
```

## Recommended: Railway.app

For no-git deployment, I recommend **Railway.app** because:
- ✅ No git required
- ✅ Direct file upload possible
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ Easy environment variables
- ✅ Simple to use

### Quick Railway Setup:

1. **Go to**: https://railway.app
2. **Sign up**: Free account
3. **New Project**: Click "Deploy from GitHub repo" then select "Empty Project" instead
4. **Create Service**: Click "+ New" → "Empty Service"
5. **Upload Files**:
   - Go to "Settings"
   - Under "Source" you may need to connect via GitHub, BUT...
   - Alternative: Use Railway CLI for direct upload

### Railway CLI Method:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize in your folder
cd python-pdf-service
railway init

# Link to project (follow prompts)
railway link

# Deploy
railway up
```

## What if ALL of These Fail?

### Last Resort: Replit (100% Works)

1. Go to https://replit.com
2. Create account (free)
3. Click "Create Repl"
4. Choose "Python" template
5. Click "Import from GitHub" or just upload files:
   - Delete the default files
   - Upload all files from `python-pdf-service` folder
   - Make sure `app.py` is in the root
6. Replit auto-detects Flask
7. Click "Run"
8. Your service is now live!

Replit gives you a URL like: `https://pdf-parser-service.username.repl.co`

### Replit Configuration

Create a file called `.replit` with:

```toml
run = "gunicorn --bind 0.0.0.0:5000 --workers 2 app:app"

[env]
API_KEY = "your-secret-key-here"
PORT = "5000"
```

## Summary: Easiest to Hardest

1. **Replit** - Upload files, click Run ⭐ Easiest
2. **Railway.app** - CLI or web upload
3. **Fly.io** - Docker deployment
4. **Render** - Needs git unfortunately
5. **Manual Docker** - Build and deploy anywhere

## After Successful Deployment

No matter which method you use, once deployed:

1. **Test it works**:
   ```bash
   curl https://your-service-url.com/health
   ```

2. **Copy your API key** from environment variables

3. **Configure Supabase**:
   ```sql
   INSERT INTO system_config (key, value)
   VALUES ('PYTHON_PARSER_API_KEY', 'your-api-key');
   ```

4. **Add URL to Supabase**:
   - Project Settings → Edge Functions
   - Add variable: `PYTHON_PARSER_SERVICE_URL` = your service URL

5. **Test from your app** - upload a PDF!

## Need Help?

If you're still stuck, tell me:
1. Which method you tried
2. What error you got
3. What platform you prefer

I'll give you more specific instructions!
