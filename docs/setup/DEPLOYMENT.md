# Free Deployment Guide

This project is a Vite static app, so it can be deployed on free static hosting.

## Recommended Free Options

| Platform | Build Command | Publish Directory | Notes |
| --- | --- | --- | --- |
| Vercel | `npm run build` | `dist` | `vercel.json` is included. |
| Netlify | `npm run build` | `dist` | `netlify.toml` is included. |
| Cloudflare Pages | `npm run build` | `dist` | Configure manually in the Pages dashboard. |

## Production Limitation

The current app stores demo data and uploaded file metadata in browser local storage. This is fine for demos and free static deployment, but real production needs:

- Authentication backed by a server or managed auth provider.
- Database storage for projects, approvals, bills, messages, and audit logs.
- File storage for drawings, photos, RA bills, invoices, and permits.
- Permission enforcement on the backend, not only in the frontend.

## Readiness Levels

| Level | Can be free deployed? | Customer promise allowed | Must be true |
| --- | --- | --- | --- |
| Demo | Yes | "You can try the workflow in browser." | No real confidential data; user understands localStorage reset risk. |
| Paid pilot | Yes, with clear warning | "We will configure a pilot and collect workflow feedback." | Written boundary that data is not production-grade multi-user storage. |
| Production SaaS | No, needs backend | "Multiple users can safely work on real projects." | Auth, database, file storage, backend permissions, backups, audit log. |
| Custom/private deployment | Needs scoped infra | "Your company gets a controlled private setup." | Custom domain, storage policy, support owner, backup/restore, admin process. |
| Enterprise/compliance | Needs separate review | "Formal controls and auditability." | Legal/security review, retention policy, SSO if needed, incident response. |

## Suggested Free Backend Path

Use Supabase free tier or Firebase free tier when the app moves beyond demo mode:

- Supabase Auth for roles: architect, PM, contractor, client.
- Supabase Postgres for project records.
- Supabase Storage for uploaded drawings and attachments.
- Row Level Security policies for role boundaries.

## Deploy Checklist

1. Run `npm install`.
2. Run `npm test`.
3. Deploy `dist`.
4. Test login roles after deployment.
5. Test upload UI on Issues, Drawings, Field Ops, Approvals, Invoices, RA Bills, and Messages.
6. Confirm mobile layout for field users.
