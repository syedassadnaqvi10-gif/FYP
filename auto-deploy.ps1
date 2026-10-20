# Auto-Deployment Script for FutureScope
# This script will help automate the deployment process

param(
    [string]$GitHubRepoUrl = "",
    [string]$MongoDBUri = "",
    [string]$CloudinaryCloudName = "",
    [string]$CloudinaryApiKey = "",
    [string]$CloudinaryApiSecret = "",
    [string]$JwtSecret = ""
)

Write-Host "🚀 FutureScope Auto-Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Function to prompt for input
function Get-RequiredInput {
    param([string]$Prompt, [string]$Default = "")
    if ($Default) {
        $value = Read-Host "$Prompt [$Default]"
        if ([string]::IsNullOrWhiteSpace($value)) {
            return $Default
        }
        return $value
    }
    do {
        $value = Read-Host $Prompt
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Host "This field is required!" -ForegroundColor Red
        }
    } while ([string]::IsNullOrWhiteSpace($value))
    return $value
}

# Collect all required information
Write-Host "📋 Collecting Deployment Information" -ForegroundColor Yellow
Write-Host "────────────────────────────────────" -ForegroundColor Yellow
Write-Host ""

# Check if running in interactive mode or with parameters
if ($GitHubRepoUrl -eq "" -and $PSBoundParameters.Count -eq 0) {
    Write-Host "I'll collect the information I need from you:" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "1️⃣  GITHUB REPOSITORY" -ForegroundColor Green
    Write-Host "   Create a new repo at https://github.com/new" -ForegroundColor Gray
    Write-Host "   Name it: futurescope-website (or any name)" -ForegroundColor Gray
    Write-Host "   Make it PUBLIC (required for free hosting)" -ForegroundColor Gray
    Write-Host ""
    $GitHubRepoUrl = Get-RequiredInput "   Enter your GitHub repository URL (e.g., https://github.com/username/repo)"
    
    Write-Host ""
    Write-Host "2️⃣  MONGODB ATLAS" -ForegroundColor Green
    Write-Host "   Setup MongoDB Atlas: https://www.mongodb.com/cloud/atlas" -ForegroundColor Gray
    Write-Host "   Create free cluster → Get connection string" -ForegroundColor Gray
    Write-Host ""
    $MongoDBUri = Get-RequiredInput "   Enter MongoDB connection string (mongodb+srv://...)"
    
    Write-Host ""
    Write-Host "3️⃣  CLOUDINARY (You should already have this)" -ForegroundColor Green
    Write-Host "   Get from: https://console.cloudinary.com → Settings → API Keys" -ForegroundColor Gray
    Write-Host ""
    $CloudinaryCloudName = Get-RequiredInput "   Enter Cloudinary Cloud Name"
    $CloudinaryApiKey = Get-RequiredInput "   Enter Cloudinary API Key"
    $CloudinaryApiSecret = Get-RequiredInput "   Enter Cloudinary API Secret"
    
    Write-Host ""
    Write-Host "4️⃣  SECURITY" -ForegroundColor Green
    Write-Host ""
    $JwtSecret = Get-RequiredInput "   Enter JWT Secret (or press Enter to generate one)" ""
    if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
        $JwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
        Write-Host "   Generated JWT Secret: $JwtSecret" -ForegroundColor Green
    }
}

# Validate all inputs
Write-Host ""
Write-Host "✅ Validating Information..." -ForegroundColor Yellow

if (-not $GitHubRepoUrl -or -not $GitHubRepoUrl.StartsWith("http")) {
    Write-Host "❌ Invalid GitHub repository URL" -ForegroundColor Red
    exit 1
}

if (-not $MongoDBUri -or -not $MongoDBUri.StartsWith("mongodb")) {
    Write-Host "❌ Invalid MongoDB connection string" -ForegroundColor Red
    exit 1
}

Write-Host "✅ All information validated!" -ForegroundColor Green
Write-Host ""

# Step 1: Push to GitHub
Write-Host "📤 STEP 1: Pushing Code to GitHub" -ForegroundColor Cyan
Write-Host "─────────────────────────────────" -ForegroundColor Cyan

# Check if remote exists
$existingRemote = git remote get-url origin 2>$null
if ($existingRemote) {
    Write-Host "⚠️  Remote already exists: $existingRemote" -ForegroundColor Yellow
    $update = Read-Host "Update to new URL? (y/n)"
    if ($update -eq "y" -or $update -eq "Y") {
        git remote set-url origin $GitHubRepoUrl
        Write-Host "✅ Remote updated!" -ForegroundColor Green
    }
} else {
    git remote add origin $GitHubRepoUrl
    Write-Host "✅ Remote added!" -ForegroundColor Green
}

# Ensure we're on main branch
git branch -M main

# Check if there are uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "📝 Committing changes..." -ForegroundColor Yellow
    git add .
    git commit -m "Auto-deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

# Push to GitHub
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
try {
    git push -u origin main
    Write-Host "✅ Code pushed to GitHub successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push to GitHub. Make sure you have access and the repo exists." -ForegroundColor Red
    Write-Host "   You may need to authenticate: git push -u origin main" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Create deployment instructions file
Write-Host "📝 STEP 2: Creating Deployment Instructions" -ForegroundColor Cyan
Write-Host "───────────────────────────────────────────" -ForegroundColor Cyan

$deploymentInfo = @"
# Deployment Information for $GitHubRepoUrl

## Backend Environment Variables (Railway)
Copy these to Railway → Variables tab:

MONGO_URI=$MongoDBUri
PORT=8000
SECRET_KEY=$JwtSecret
CLOUD_NAME=$CloudinaryCloudName
API_KEY=$CloudinaryApiKey
API_SECRET=$CloudinaryApiSecret
FRONTEND_URL=https://YOUR_VERCEL_URL.vercel.app (Update after frontend deploys)
NODE_ENV=production

## Railway Settings
- Root Directory: backend
- Start Command: npm start

## Frontend Environment Variable (Vercel)
Copy this to Vercel → Environment Variables:

VITE_API_BASE_URL=https://YOUR_RAILWAY_URL.railway.app (Update after backend deploys)

## Vercel Settings
- Root Directory: frontend
- Framework: Vite

## Next Steps:
1. Deploy frontend on Vercel: https://vercel.com
   - Import repo: $GitHubRepoUrl
   - Root: frontend
   - Add VITE_API_BASE_URL (temporary: https://placeholder.railway.app)
   - Deploy and get Vercel URL

2. Deploy backend on Railway: https://railway.app
   - Import repo: $GitHubRepoUrl
   - Root: backend
   - Add all environment variables above (update FRONTEND_URL with Vercel URL)
   - Generate domain and get Railway URL

3. Update frontend:
   - Update VITE_API_BASE_URL in Vercel with Railway URL
   - Redeploy frontend

4. Done! Your website is live!
"@

$deploymentInfo | Out-File -FilePath "DEPLOYMENT_INFO.txt" -Encoding UTF8
Write-Host "✅ Created DEPLOYMENT_INFO.txt with all your credentials" -ForegroundColor Green
Write-Host ""

# Step 3: Check for CLI tools
Write-Host "🔧 STEP 3: Checking for Deployment CLI Tools" -ForegroundColor Cyan
Write-Host "───────────────────────────────────────────" -ForegroundColor Cyan

# Check for Vercel CLI
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if ($vercelInstalled) {
    Write-Host "✅ Vercel CLI found!" -ForegroundColor Green
    Write-Host "   You can deploy frontend with: cd frontend; vercel" -ForegroundColor Gray
} else {
    Write-Host "ℹ️  Vercel CLI not installed" -ForegroundColor Yellow
    Write-Host "   Install: npm install -g vercel" -ForegroundColor Gray
    Write-Host "   Or deploy via web interface: https://vercel.com" -ForegroundColor Gray
}

# Check for Railway CLI
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if ($railwayInstalled) {
    Write-Host "✅ Railway CLI found!" -ForegroundColor Green
    Write-Host "   You can deploy backend with: railway up" -ForegroundColor Gray
} else {
    Write-Host "ℹ️  Railway CLI not installed" -ForegroundColor Yellow
    Write-Host "   Install: npm install -g @railway/cli" -ForegroundColor Gray
    Write-Host "   Or deploy via web interface: https://railway.app" -ForegroundColor Gray
}

Write-Host ""

# Summary
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ SETUP COMPLETE!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open DEPLOYMENT_INFO.txt - it has all your credentials" -ForegroundColor White
Write-Host "2. Follow QUICK_DEPLOY.md for step-by-step instructions" -ForegroundColor White
Write-Host "3. Your code is ready to deploy!" -ForegroundColor White
Write-Host ""
Write-Host "💡 Quick Deploy Links:" -ForegroundColor Cyan
Write-Host "   Frontend: https://vercel.com" -ForegroundColor White
Write-Host "   Backend:  https://railway.app" -ForegroundColor White
Write-Host "   Database: https://mongodb.com/cloud/atlas" -ForegroundColor White
Write-Host ""
Write-Host "🎯 Your GitHub Repo: $GitHubRepoUrl" -ForegroundColor Green
Write-Host ""




