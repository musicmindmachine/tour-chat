# Convex Backend

Backend functions for Drop Tuning Box.

Main files:

- `auth.ts`: ConvexAuth configuration (Resend OTP + allowlist gating + 30 day sessions)
- `auth.config.ts`: auth provider domain configuration
- `http.ts`: registers ConvexAuth HTTP routes
- `schema.ts`: Convex tables (`authTables` + `files` + `emailAllowlist` + `users.role`)
- `files.ts`: signed upload URL generation, metadata sync, file listing, delete
- `users.ts`: viewer/profile mutations + admin-only allowlist mutations
- `convex.config.ts`: installs the Convex R2 component

Run `pnpm convex dev` from the project root to deploy backend changes and regenerate `_generated` files.
