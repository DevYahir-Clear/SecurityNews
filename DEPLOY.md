# Deploying SecurityScope to Azure (portal click-path)

This deploys SecurityScope to **Azure App Service** using "Code" publish mode
and GitHub Actions for automatic builds, with **Azure Communication Services
(ACS)** sending the scheduled email digest. Everything below uses the Azure
Portal — no CLI required, and no Docker involved. Total cost on small/basic
tiers is a few dollars a month; App Service has a free F1 tier that also
works for personal use (with some idle/sleep limits).

---

## Part 1 — Set up email (Azure Communication Services)

1. In the Azure Portal search bar, type **Communication Services** → **Create**.
2. Pick your Resource Group (or create one, e.g. `securityscope-rg`), give it
   a name like `securityscope-acs`, choose a region, **Create**.
3. Once it's deployed, go to the resource → **Email** (left sidebar) →
   **Provision domains** → **Add domain**.
   - Pick **Azure managed domain** (fastest — no DNS setup, gives you an
     address like `DoNotReply@xxxx.azurecomm.net`). If you own a domain and
     want a branded sender, pick **Custom domain** instead and follow the DNS
     verification steps shown.
4. Once the domain shows **Verified**, open it → **MailFrom addresses** →
   note the full address (e.g. `DoNotReply@xxxx.azurecomm.net`). This is your
   `ACS_SENDER_ADDRESS`.
5. Back on the main ACS resource page → **Settings → Keys** → copy the
   **Connection string**. This is your `ACS_CONNECTION_STRING`.
6. Still on the ACS resource → **Email → Domains** → your domain →
   **Connect** (link the domain to this ACS resource, if not already linked
   automatically).

Keep both values handy — you'll paste them into App Service settings in Part 3.

---

## Part 2 — Push the code to GitHub

1. Create a new GitHub repo (e.g. `securityscope`).
2. Upload the entire contents of this project folder to that repo — including
   the `.github/workflows/deploy.yml` file (this is what makes Azure build and
   deploy automatically on every push). Drag-and-drop via GitHub's web UI
   works fine, or GitHub Desktop if you prefer a GUI over command line.

You don't need to build anything yourself — GitHub Actions will build the
frontend and package the backend automatically once it's connected to Azure
in Part 3.

---

## Part 3 — Create the Web App on Azure App Service

1. Portal search bar → **App Services** → **Create** → **Web App**.
2. **Basics** tab:
   - **Resource Group**: same one as your ACS resource (`securityscope-group`)
   - **Name**: something globally unique, e.g. `securityscope-yourname`
     (this becomes `https://securityscope-yourname.azurewebsites.net`)
   - **Publish**: **Code** (not Container — we're not using Docker for this path)
   - **Runtime stack**: **Node 20 LTS**
   - **Operating System**: Linux
   - **Region**: same region as your ACS resource if possible
   - **Pricing plan**: **Basic B1** is a safe low-cost choice (~$13/mo) so
     scheduled scans/emails keep running even when idle; **Free F1** also
     works but sleeps after inactivity, which would skip scheduled jobs while asleep.
3. Skip the **Database**, **Container**, **Networking**, and **Monitor + secure**
   tabs — defaults are fine for personal use.
4. Click **Review + create**, then **Create**. Wait for deployment to finish
   (~1 minute), then **Go to resource**.

### Connect GitHub Actions

1. On your new Web App's page, open **Deployment Center** (left sidebar).
2. **Source**: select **GitHub** → authorize access if prompted → pick your
   organization/account, the `securityscope` repo, and the `main` branch.
3. **Build provider**: it should auto-detect **GitHub Actions** since this
   repo already includes `.github/workflows/deploy.yml`. Leave it as-is — do
   **not** let it auto-generate a new workflow file (it'll detect and use the
   one already in the repo).
4. Click **Save**. Azure will add two repository secrets to your GitHub repo
   automatically: `AZURE_WEBAPP_NAME` and `AZURE_WEBAPP_PUBLISH_PROFILE` —
   these are what the included workflow file uses, so no manual secret setup
   needed.
5. Go to your GitHub repo → **Actions** tab. You should see a workflow run
   start automatically (triggered by Deployment Center's setup commit). Wait
   for it to go green (~2-3 minutes) — it builds the frontend, packages the
   backend, and deploys.

If the workflow run is red/failed, click into it to see which step failed —
the most common cause is a typo in the repo path; re-check that
`.github/workflows/deploy.yml` is at the repo root (not nested in a subfolder).

---

## Part 4 — Configure environment variables

1. Once deployed, go to your new Web App resource → **Settings →
   Environment variables** (older portal label: **Configuration**).
2. Add these **Application settings** (click **+ Add** for each):

   | Name | Value |
   |---|---|
   | `ACS_CONNECTION_STRING` | the connection string from Part 1 step 5 |
   | `ACS_SENDER_ADDRESS` | the MailFrom address from Part 1 step 4 |
   | `DATA_DIR` | `/home/data` |
   | `WEBSITE_RUN_FROM_PACKAGE` | `0` |

   `WEBSITE_RUN_FROM_PACKAGE=0` matters here: it tells App Service to unpack
   the deployed code onto writable disk (instead of mounting it read-only),
   which this app needs since it writes its SQLite database file at runtime.

3. Click **Apply** → **Confirm**. The app will restart with these values.

`DATA_DIR=/home/data` matters: on Azure App Service for Linux containers,
only the `/home` path is backed by persistent storage. Anything written
elsewhere in the container is wiped on every restart/redeploy — that would
silently lose your sources, read-state, and scan history.

---

## Part 5 — Open it from anywhere

Go to your Web App's **Overview** page and click the **Default domain** URL
(`https://securityscope-yourname.azurewebsites.net`). That's it — open that
same URL from your phone, laptop, anywhere. No login system is included by
default, so anyone with the URL can use it; see "Optional: restrict access"
below if you want to lock it down.

In the app:
1. Go to the **Email digest** tab.
2. Enter your email address, pick a schedule, toggle digest **ON**.
3. Click **Send digest now** once to confirm email delivery works end-to-end.

The backend scans all enabled sources every 30 minutes automatically, and
sends the digest email on whatever schedule you picked.

---

## Optional: restrict access to just you

Since this is a personal tool, you probably don't want it world-accessible.
Easiest option in the portal:

1. Web App → **Settings → Authentication** → **Add identity provider**.
2. Choose **Microsoft** (uses your existing Microsoft/Azure AD account) →
   follow the prompts, leave default app registration settings.
3. Under **Authentication settings**, set "Restrict access" to
   **Require authentication**.

Now visiting the URL requires signing in with your Microsoft account first.

---

## Updating the app later

Any time you push new commits to the GitHub repo's connected branch, App
Service's **Deployment Center** (left sidebar of the Web App) will pick up
the change and rebuild automatically — no redeploy steps needed on your end.

---

## Troubleshooting checklist

- **No items showing up**: open `https://<your-app>.azurewebsites.net/api/health`
  — should return `{"ok":true,...}`. If that fails, the app didn't start
  correctly; check **Log stream** or the GitHub Actions run logs for errors.
- **Email not arriving**: Web App → **Log stream** (left sidebar) while
  clicking "Send digest now" — errors from ACS will print there. Common cause:
  sender address doesn't match a verified domain in your ACS resource.
- **Data disappears after a redeploy**: confirm `DATA_DIR=/home/data` is set
  exactly as above.
