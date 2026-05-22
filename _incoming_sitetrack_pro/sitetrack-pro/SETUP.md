# SiteTrack Pro — Quick Setup

## ⚡ Run in 3 steps

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open browser
# http://localhost:5173
```

## 🚀 Deploy to Vercel (Free)

```bash
npm install -g vercel
npm run build
vercel --prod
```

## 👥 Login Roles (Demo)

| Role | Access |
|------|--------|
| Architect | Full access — all features |
| Project Manager | Field ops — updates, diary, attendance |
| Contractor | Work logs, RFIs, invoices, drawings |
| Client | Read-only — progress, milestones |

## 📁 Files

```
src/
  App.jsx          ← Complete React app (1800+ lines)
  main.jsx         ← Entry point
  index.css        ← Tailwind base styles
public/
  manifest.json    ← PWA manifest
docs/
  README.md        ← Full feature list
  pwa-setup.md     ← Mobile PWA guide
  supabase-setup.js ← Real backend guide
```

## 🔐 Real Backend (Supabase)
See docs/supabase-setup.js for full DB schema + auth setup.

## 📱 Mobile App (PWA)
See docs/pwa-setup.md to install on phone.
