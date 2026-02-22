# Drop Tuning Box

Basic Dropbox-style shared file storage with:

- Next.js + `shadcn/ui` frontend
- Convex backend/database
- ConvexAuth (email OTP codes via Resend)
- Convex R2 component for signed uploads + signed downloads

## What this app does

- `/signin`: sign in with email + one-time password (OTP)
- `/`: shared file list (all uploaded files/directories)
- `/account`: basic account management (display name, email, sign out)
- Admins can manage an email allowlist from the user dropdown

## 1) Install and initialize

```bash
pnpm install
pnpm dev:backend
```

The first `convex dev` run will create `.env.local` with values like:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`

Then run the frontend:

```bash
pnpm dev:frontend
```

Or run both together:

```bash
pnpm dev
```

## 2) ConvexAuth + Resend setup (email OTP)

This project uses only the Resend provider in `/Users/ecstipan/Downloads/drop-tuning-box/convex/auth.ts`.

Set Convex environment variables:

```bash
npx convex env set AUTH_RESEND_KEY re_xxxxxxxxxxxxx
npx convex env set AUTH_RESEND_FROM "Drop Tuning Box <onboarding@resend.dev>"
npx convex env set SITE_URL http://localhost:3000
```

Notes:

- `AUTH_RESEND_KEY` is required.
- `AUTH_RESEND_FROM` is optional. Use `onboarding@resend.dev` for testing, or your verified domain sender in production.
- `SITE_URL` is required by ConvexAuth redirects. In production set it to your app origin (for example `https://app.yourdomain.com`).
- Session cookies are now configured to persist for 30 days.
- Resend test mode only sends to your own Resend account address. To send to other users, verify a domain in Resend and set `AUTH_RESEND_FROM` to that domain.
- New users must be present in the `emailAllowlist` table before they can complete their first sign-in.
- The first admin can be bootstrapped by signing in as an existing user when no admins exist yet; after that, only admins can manage the allowlist.
- ConvexAuth also requires JWT signing keys. If you ever see `Missing environment variable JWT_PRIVATE_KEY`, run:
  - `npx @convex-dev/auth --skip-git-check`
  This sets `JWT_PRIVATE_KEY` and `JWKS` on your Convex deployment.

Auth wiring lives in:

- `/Users/ecstipan/Downloads/drop-tuning-box/convex/auth.ts`
- `/Users/ecstipan/Downloads/drop-tuning-box/convex/auth.config.ts`
- `/Users/ecstipan/Downloads/drop-tuning-box/convex/http.ts`
- `/Users/ecstipan/Downloads/drop-tuning-box/middleware.ts`

## 3) Cloudflare R2 setup (signed uploads/downloads)

Create an R2 API token with **Object Read & Write** access for your bucket, then set:

```bash
npx convex env set R2_ACCESS_KEY_ID xxxxxxxxx
npx convex env set R2_SECRET_ACCESS_KEY xxxxxxxxx
npx convex env set R2_ENDPOINT https://<account-id>.r2.cloudflarestorage.com
npx convex env set R2_BUCKET <your-bucket-name>
```

R2 component wiring lives in:

- `/Users/ecstipan/Downloads/drop-tuning-box/convex/convex.config.ts`
- `/Users/ecstipan/Downloads/drop-tuning-box/convex/files.ts`

### Optional: ZIP whole folders via Worker streaming

This repo includes a Cloudflare Worker at:

- `/Users/ecstipan/Downloads/drop-tuning-box/workers/r2-zip-download/src/index.ts`

It streams ZIP archives from R2 by prefix so Convex does not hold large archive bytes in memory.

#### Worker setup

```bash
cp /Users/ecstipan/Downloads/drop-tuning-box/workers/r2-zip-download/wrangler.toml.example /Users/ecstipan/Downloads/drop-tuning-box/workers/r2-zip-download/wrangler.toml
cd /Users/ecstipan/Downloads/drop-tuning-box/workers/r2-zip-download
npx wrangler secret put ZIP_DOWNLOAD_TOKEN_SECRET
npx wrangler deploy
```

Bind `FILES_BUCKET` in `wrangler.toml` to the same R2 bucket used by Convex.
If you're on Workers Paid, set `[limits] cpu_ms = 300000` in `wrangler.toml` for larger ZIP requests.
Workers Free CPU limits are usually too low for on-the-fly ZIP CRC generation.

#### Convex env vars for ZIP downloads

Set the same secret in Convex, plus your deployed Worker endpoint:

```bash
cd /Users/ecstipan/Downloads/drop-tuning-box
npx convex env set ZIP_DOWNLOAD_TOKEN_SECRET <same-secret-used-in-worker>
npx convex env set ZIP_DOWNLOAD_WORKER_URL https://<your-worker-subdomain>.workers.dev/download-zip
```

The frontend’s **Download ZIP** controls call `api.files.createZipDownloadUrl`, which mints short-lived signed tokens for the Worker.
You can opt in to recursive ZIPs (include subfolders) or download only direct files in the selected folder.

### R2 CORS policy

Add a CORS policy to your bucket so browser uploads can PUT directly to R2.

Example for local dev:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

## 4) Generate Convex types after backend changes

```bash
pnpm convex codegen
```

## 5) Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Important implementation notes

- Upload URLs are signed by Convex and scoped to the generated object key.
- File metadata is synced from R2 into Convex and then indexed in the `files` table.
- Cloudflare R2 encrypts objects at rest by default. This app adds signed URL access control on top.
