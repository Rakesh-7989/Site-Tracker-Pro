# 🏗️ SiteTrack Pro — Construction Management App

Real-time site tracking with role-based access, built with React + Tailwind CSS.

---

## 📦 Files in this package

| File | Description |
|------|-------------|
| `sitetrack.jsx` | Main React app — all features |
| `pwa-setup.md` | PWA manifest + service worker (install on phone) |
| `supabase-setup.js` | Real backend setup (database, auth, real-time) |
| `README.md` | This file |

---

## 🚀 Quick Start (5 minutes)

```bash
# Create React project
npm create vite@latest sitetrack -- --template react
cd sitetrack

# Install dependencies
npm install recharts

# Replace src/App.jsx with sitetrack.jsx contents
# Add to index.html: <link href="https://cdn.tailwindcss.com" rel="stylesheet">

# Run
npm run dev
```

---

## 👥 Role-Based Access

| Feature | Architect | PM | Client |
|---------|-----------|-----|--------|
| Create Projects | ✅ | ❌ | ❌ |
| Edit Progress % | ✅ | ❌ | ❌ |
| Release Drawings | ✅ | View Only | View Released |
| Add Site Updates | ✅ | ✅ | ❌ |
| Report Issues | ✅ | ✅ | ❌ |
| Resolve Issues | ✅ | ✅ | ❌ |
| Add Expenses | ✅ | ❌ | ❌ |
| Delete Expenses | ✅ | ❌ | ❌ |
| Manage Team | ✅ | View Only | ❌ |
| Mark Attendance | ✅ | ✅ | ❌ |
| Add Materials | ✅ | ✅ | ❌ |
| Messaging | ✅ ↔ ✅ | ✅ ↔ ✅ | ❌ |
| View Budget | ✅ | ✅ | ❌ |
| Export PDF/CSV | ✅ | ✅ | ❌ |
| Share Links | ✅ | ❌ | View Only |
| Activity Feed | ✅ Only | ❌ | ❌ |
| Analytics | ✅ | ✅ | ❌ |

---

## ✨ All Features

### Projects
- Create / view / filter projects
- Progress % edit with slider
- Status tracking (Active / Completed / On Hold)
- Advanced search + filters

### Site Updates
- Daily site notes with weather & worker count
- Photo upload with lightbox gallery
- Auto-notifies architect when PM adds update

### Milestones
- Visual milestone tracker
- Click badge to change status (pending → in_progress → completed)
- Gantt timeline view

### Issues & Punch List
- Report issues with High / Medium / Low severity
- Resolve issues with one click
- Dashboard alerts for high severity issues

### Material Deliveries
- Log expected deliveries
- Mark as Received / Rejected
- Auto-notifies architect on receipt

### Drawing Releases
- Architect releases drawings with revision numbers
- Per-drawing access control (PM only / Client only / Both)
- Supersede old revisions
- Released drawings appear in client share link

### Team & Attendance
- Add team members with roles and phone numbers
- Active / On Leave status toggle
- Daily attendance marking (Present / Half Day / Absent)
- Weekly attendance history

### Budget & Expenses
- Budget utilization bar with category breakdown
- Add / delete expenses with categories
- Export to CSV

### Messaging
- Real-time project-level chat between Architect and PM
- Unread message badges
- Browser push notifications

### Analytics
- Project progress bar charts
- Status distribution pie chart
- Budget vs Spent comparison
- Built with Recharts

### Maps
- OpenStreetMap embed for each project
- "Open in Google Maps" button
- Site coordinates display

### Architect Activity Feed
- All PM actions auto-logged
- Read / unread tracking
- Filter by project

### Export
- PDF report with milestones, issues, updates, expenses
- CSV expense export

### Client Features
- Client share link (no login needed)
- Released drawings visible to client
- Progress, milestones, updates view

### UI/UX
- Dark mode toggle
- Mobile responsive with hamburger menu
- Role badge in header
- Access denied screens for restricted areas

---

## 🔐 Real Backend (Supabase)

See `supabase-setup.js` for:
- Full SQL schema
- Row-level security policies
- Real-time subscriptions
- File storage for photos
- Push notifications

---

## 📱 Mobile PWA

See `pwa-setup.md` for:
- App manifest
- Service worker (offline support)
- Install on iOS / Android
- Push notifications

---

## 🛠️ Tech Stack

- **React** + Vite
- **Tailwind CSS** (utility classes)
- **Recharts** (analytics charts)
- **OpenStreetMap** (map embeds)
- **Supabase** (optional real backend)

---

## 📞 Support

Built with SiteTrack Pro.
For customization: arjun@buildco.in
