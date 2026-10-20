# Deployment Helper Script for FutureScope
# This script helps you prepare and deploy your website

Write-Host "🚀 FutureScope Deployment Helper" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "❌ Git not initialized. Run: git init" -ForegroundColor Red
    exit 1
}

# Check current branch
$currentBranch = git branch --show-current
Write-Host "📍 Current branch: $currentBranch" -ForegroundColor Yellow
Write-Host ""

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "📝 Uncommitted changes found. Committing them..." -ForegroundColor Yellow
    git add .
    git commit -m "Prepare for deployment - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "✅ Changes committed!" -ForegroundColor Green
} else {
    Write-Host "✅ No uncommitted changes" -ForegroundColor Green
}
Write-Host ""

# Check if remote is set
$remote = git remote get-url origin 2>$null
if ($remote) {
    Write-Host "🔗 Remote repository: $remote" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📤 Ready to push? (y/n)" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
        git push -u origin main
        Write-Host ""
        Write-Host "✅ Code pushed to GitHub!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Follow QUICK_DEPLOY.md for deployment steps" -ForegroundColor White
        Write-Host "2. Your GitHub repo: $remote" -ForegroundColor White
    }
} else {
    Write-Host "⚠️  No remote repository configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 To add a remote repository:" -ForegroundColor Cyan
    Write-Host "1. Create a new repository on GitHub" -ForegroundColor White
    Write-Host "2. Run: git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git" -ForegroundColor White
    Write-Host "3. Run: git branch -M main" -ForegroundColor White
    Write-Host "4. Run: git push -u origin main" -ForegroundColor White
    Write-Host ""
    Write-Host "Or follow the instructions in QUICK_DEPLOY.md" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✨ Deployment Helper Complete!" -ForegroundColor Green




