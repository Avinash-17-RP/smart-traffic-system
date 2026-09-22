# Deployment Guide — MA-TRSN Smart Traffic Congestion

This project has **two parts** that must be deployed separately:

| Component | Technology | Deploy To |
|-----------|-----------|-----------|
| **Frontend** | React + Vite (static files) | **Netlify** |
| **Backend** | Express + Socket.IO + SQLite | **Render.com** |

> **Why two platforms?** Netlify only serves static files. It cannot run a persistent Node.js server with WebSockets and a SQLite database.

---

## Step 1: Deploy Backend on Render.com

### 1.1 Push to GitHub
Make sure your repository is pushed to GitHub with all recent changes (including the `.sqlite` file).

```bash
git add -A
git commit -m "Prepare for deployment"
git push origin main
```

### 1.2 Create Render Web Service

1. Go to [render.com](https://render.com) → Sign up / Log in.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Fill in these settings:

| Setting | Value |
|---------|-------|
| **Name** | `smart-traffic-backend` |
| **Root Directory** | `backend` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

5. Click **Create Web Service**.
6. Wait for the deploy to complete (may take 2–3 minutes).
7. Copy your backend URL — it will look like:
   ```
   https://smart-traffic-backend.onrender.com
   ```

### 1.3 Verify Backend

Visit these URLs in your browser:
- `https://smart-traffic-backend.onrender.com/api/health` → Should return `{"status":"ok",...}`
- `https://smart-traffic-backend.onrender.com/api/graph` → Should return junction/edge JSON

> **Note:** Render free tier spins down after 15 minutes of inactivity. The first request after idle may take 30–60 seconds.

---

## Step 2: Deploy Frontend on Netlify

### 2.1 Create Netlify Site

1. Go to [app.netlify.com](https://app.netlify.com) → Log in.
2. Click **Add new site** → **Import an existing project** → select your GitHub repo.

### 2.2 Configure Build Settings

| Setting | Value |
|---------|-------|
| **Base directory** | *(leave empty)* |
| **Build command** | `cd frontend && npm install && npm run build` |
| **Publish directory** | `frontend/dist` |

### 2.3 Add Environment Variable (CRITICAL)

Go to **Site configuration** → **Environment variables** → **Add a variable**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://smart-traffic-backend.onrender.com` |

> Replace with YOUR actual Render URL from Step 1.7.

### 2.4 Deploy

Click **Deploy site** (or **Deploys** → **Trigger deploy** → **Clear cache and deploy site**).

---

## Step 3: Verify Everything Works

1. Open your Netlify URL (e.g., `https://your-site.netlify.app`).
2. The **Citizen Route** page should show live junction data.
3. Click **Live City Graph** — nodes should update in real-time.
4. Log in with `admin` / `password123` → **Control Room** should show stats.
5. Open browser DevTools (F12) → **Console** — no `ERR_CONNECTION_REFUSED` or `Mixed Content` errors.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `vite: not found` on Netlify | Build command wrong | Use `cd frontend && npm install && npm run build` |
| API calls return `ERR_CONNECTION_REFUSED` | `VITE_API_URL` not set | Add env var in Netlify dashboard, then redeploy |
| `Mixed Content` errors in console | Backend URL uses `http://` | Render provides `https://` by default — use it |
| Backend returns 502 on Render | App crashed on startup | Check Render logs; ensure `matrsn.sqlite` is committed |
| Data loads but WebSocket doesn't connect | Socket URL wrong | `VITE_API_URL` is used for both API and Socket.IO |
| Render is slow (30s first load) | Free tier cold start | Normal — subsequent requests are fast |

---

## Important Notes

- **`VITE_API_URL` is baked at build time.** If you change the Render URL, you must redeploy on Netlify.
- **Render free tier** hibernates after 15 min of inactivity. Consider upgrading for production use.
- **Login credentials** for the demo: `admin` / `password123`.
