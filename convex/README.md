# Convex Backend

Backend functions for Drop Tuning Box.

Main files:

- `auth.ts`: ConvexAuth configuration (Resend magic links)
- `auth.config.ts`: auth provider domain configuration
- `http.ts`: registers ConvexAuth HTTP routes
- `schema.ts`: Convex tables (`authTables` + `files`)
- `files.ts`: signed upload URL generation, metadata sync, file listing, delete
- `users.ts`: viewer query and profile update mutation
- `convex.config.ts`: installs the Convex R2 component

Run `pnpm convex dev` from the project root to deploy backend changes and regenerate `_generated` files.
