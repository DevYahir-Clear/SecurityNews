# SecurityScope

A personal cybersecurity intelligence aggregator: scans CISA's Known
Exploited Vulnerabilities list, NVD, and any RSS/Atom feeds you add (security
blogs, vendor advisories, forums), shows them in a web app, and emails you a
digest of what's new on a schedule.

## What's in this folder

- `backend/` — Node/Express API. Scans sources every 30 min, stores results
  in SQLite, sends digest emails via Azure Communication Services on a cron
  schedule you set in the app.
- `frontend/` — React app (Vite). The feed UI, source manager, and digest
  settings panel.
- `.github/workflows/deploy.yml` — GitHub Actions workflow that builds the
  frontend and deploys the combined app to Azure App Service automatically
  on every push. This is the path DEPLOY.md uses.
- `Dockerfile` — optional alternative if you'd rather deploy as a container
  instead of via GitHub Actions; not needed for the default path in DEPLOY.md.
- `DEPLOY.md` — **start here** — step-by-step Azure Portal click-path to get
  this live and reachable from any device.
- `.env.example` — the environment variables you'll need (copy values into
  Azure App Service's Application Settings, per DEPLOY.md).

## Local testing (optional, before deploying)

If you want to try it on your own machine first:

```bash
cd backend && npm install && npm start
# in a second terminal:
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` calls to the
backend on port 8080. Without `ACS_CONNECTION_STRING`/`ACS_SENDER_ADDRESS`
set, scanning and the in-app feed work fully; only the email-sending step
will error until those are configured.

## Deploying

Open `DEPLOY.md` and follow it top to bottom — it's written for the Azure
Portal with no command-line steps required, covering: setting up email
(Azure Communication Services), pushing this code to GitHub, creating the
App Service container, configuring environment variables and persistent
storage, and optionally locking the app down to just your account.
