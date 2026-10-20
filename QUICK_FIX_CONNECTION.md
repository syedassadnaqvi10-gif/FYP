# 🔧 Quick Fix: Backend Not Connecting to Frontend

## ⚡ Most Common Issues (Check These First!)

### 1. **CORS Configuration - Most Important!**

**In Railway → Variables tab:**
- Check `FRONTEND_URL` exists
- Must be: `https://your-vercel-url.vercel.app` (exact match, no trailing slash)
- After updating, Railway will auto-redeploy

**Example:**
```
✅ Correct: https://futurescope-website.vercel.app
❌ Wrong: https://futurescope-website.vercel.app/
❌ Wrong: http://futurescope-website.vercel.app
```

---

### 2. **Frontend API URL**

**In Vercel → Settings → Environment Variables:**
- Check `VITE_API_BASE_URL`
- Must be: `https://your-railway-url.railway.app` (no trailing slash)
- After updating, go to Deployments → Redeploy

**Example:**
```
✅ Correct: https://your-app.railway.app
❌ Wrong: https://your-app.railway.app/
```

---

### 3. **Test Your Backend**

1. **Get your Railway URL:**
   - Railway → Settings → Domains → Copy your domain

2. **Test in browser:**
   - Open: `https://your-railway-url.railway.app/api/v1/job/get`
   - Should see JSON response (even if empty array)
   - If you see 404 or error, backend isn't working

3. **Check Railway Logs:**
   - Railway → Deployments → Click latest → View logs
   - Should see: "Server running at port 8000"
   - Should see: "MongoDB connected successfully"

---

## 🎯 Step-by-Step Fix:

### Step 1: Get Your URLs
1. **Railway URL:** Railway → Settings → Domains → Copy
2. **Vercel URL:** Vercel → Your project → Copy from top

### Step 2: Update Railway Variables
1. Go to Railway → Variables
2. Set `FRONTEND_URL` = Your Vercel URL (exact copy, no trailing slash)
3. Railway will auto-redeploy

### Step 3: Update Vercel Environment Variable
1. Go to Vercel → Settings → Environment Variables
2. Set `VITE_API_BASE_URL` = Your Railway URL (exact copy, no trailing slash)
3. Go to Deployments → Redeploy

### Step 4: Test
1. Visit your Vercel site
2. Open browser console (F12)
3. Try to login/signup
4. Check Network tab for API calls

---

## 🔍 What to Check:

- [ ] Railway shows ✅ Online
- [ ] Railway logs show "Server running at port..."
- [ ] Railway logs show "MongoDB connected successfully"
- [ ] Test Railway URL in browser (should return JSON)
- [ ] `FRONTEND_URL` in Railway = Your exact Vercel URL
- [ ] `VITE_API_BASE_URL` in Vercel = Your exact Railway URL
- [ ] No trailing slashes in URLs
- [ ] Both URLs use `https://` (not `http://`)

---

## 📝 Share With Me:

If still not working, share:
1. Your Railway URL: `https://...`
2. Your Vercel URL: `https://...`
3. What error you see in browser console (F12)
4. Railway logs (last 10 lines)




