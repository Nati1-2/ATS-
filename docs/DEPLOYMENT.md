# Deployment

How to run Acme Hiring in production: Vercel (one project) or Docker. Back to the [README](../README.md).

## Deploying to Vercel (one project)

The web app and the API deploy together as **one** Vercel project with **one root**:
On Vercel, `src/pages/api/[...path].mjs` serves the Express API directly inside the Next.js app, so every `/api/*` request is handled on the same domain without needing any separate backend deployment.

1. **Database:** create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas), allow network access from anywhere (`0.0.0.0/0`), and copy the connection string (`mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/ats`).
2. **Import:** at https://vercel.com/new, import the repo. **Zero configuration needed** — root directory is left as default `/` and `vercel.json` installs all dependencies automatically.
3. **Environment variables** (add these in Vercel project Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `GEMINI_API_KEY` | optional, enables AI analysis |
   | `CLIENT_URL` | optional; defaults to the project's production URL (set it if you use a custom domain) |

   Do **not** set `API_URL`.
4. **Deploy.** `https://<project>.vercel.app/api/health` should return `{"ok":true,"db":true}`.
5. **First admin:** either set `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` in Vercel (used only while the database has no admin), or run this locally against the Atlas database:

   ```bash
   MONGODB_URI="<atlas uri>" npm run create-admin --prefix server -- --email you@company.com --name "Your Name"
   ```

6. **Careers content (optional):** `npm run sample-data` fills an empty company profile and adds sample published jobs without deleting anything. Replace them with real content under **Settings → Company** and **Jobs** before going live.

After that, every push to `main` redeploys.

### Notes on Vercel

- **Uploaded files are kept in MongoDB** (GridFS bucket `uploads`), so résumés and logos survive redeploys and are shared by every function instance; `/tmp` is only a cache. Back up the database and you have everything.
- **Résumés are limited to 4 MB on Vercel** (whatever `MAX_RESUME_MB` says), because Vercel rejects request bodies over 4.5 MB.
- **Rate limits are per function instance**, so they are looser than on a single server.
- AI rate-limit retries are only picked up again when a new instance starts.

## Production deployment (Docker)

```bash
# Uses the same .env: set JWT_SECRET, CLIENT_URL (public URL) and ADMIN_EMAIL / ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

- **Three containers:** MongoDB, the API and the web app. Only the web app is published (on `WEB_PORT`, default 3000); the API and database stay on the internal network.
- **HTTPS:** put the web app behind a reverse proxy such as Caddy, Nginx or a cloud load balancer. Keep `COOKIE_SECURE=true`. Use `false` only for a plain-HTTP trial on a private network.
- **Persistent data:** the database, including uploaded CVs and logos (GridFS), lives in the `mongo-data` volume, so it survives rebuilds and restarts. Back it up; the `uploads` volume is only a cache.
- **Safety:**
  - The API checks its configuration at startup and refuses to start with a weak or missing `JWT_SECRET`.
  - It shuts down gracefully on restart.
  - `/api/health` returns 503 when the database is down, and Docker uses this as the health check.
  - `npm run seed` refuses to run in production, because it deletes all data.
- **Security headers:** `nosniff`, `SAMEORIGIN`, `Referrer-Policy` and `Permissions-Policy` are set on every page.

