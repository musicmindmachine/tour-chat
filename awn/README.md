# Awn Monorepo

Invite-only social network scaffold with real-time message boards.

## Stack

- `apps/web`: Next.js + React + WorkOS AuthKit + Convex + shadcn/ui
- `apps/mobile`: Expo + React Native + Convex + Expo push notifications
- `packages/convex`: Convex backend (schema, authz, invites, boards, posts, search, pagination, R2, Resend, push)
- `packages/email`: React Email rendering + Resend helper utilities

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment values:

```bash
cp .env.example .env
```

3. Configure Convex env vars (especially `WORKOS_CLIENT_ID`, `RESEND_API_KEY`, `R2_*`).

4. Start Convex codegen/dev server from backend package:

```bash
pnpm --filter @awn/convex dev
```

5. Start web app:

```bash
pnpm --filter @awn/web dev
```

6. Start mobile app:

```bash
pnpm --filter @awn/mobile dev
```

## Bootstrap first admin and seed data

Set `BOOTSTRAP_SECRET` in your Convex deployment environment before running bootstrap commands.

Check bootstrap status:

```bash
pnpm --filter @awn/convex bootstrap:status
```

Promote or create first admin, create starter board, and optionally create/send invites:

```bash
pnpm --filter @awn/convex bootstrap:admin -- \
  --secret "$BOOTSTRAP_SECRET" \
  --email "admin@example.com" \
  --starterBoardName "general" \
  --invites "mod@example.com,member@example.com"
```

Optional arguments:
- `--workosUserId` to create the admin user if they have not signed in yet.
- `--username` to force first admin username when creating a user record.
- `--inviteExpiresInHours` to override default invite TTL (72h).

## Auth and access model

- Signup is invite-only by default.
- If a user signs up without an invite, `users.status = pending` until approved by an admin.
- Roles:
  - `admin`: full control, can create/archive boards, assign moderators, approve users.
  - `moderator`: can moderate only boards assigned in `boardModerators`.
  - `member`: can read/post to boards.

## Convex data model highlights

- `posts.by_board_created_at` index supports efficient board pagination.
- `posts.search_body` search index supports board-scoped full-text search.
- `files.by_key` index is used for secure presigned file URL authorization.

## Notifications

- Mention parsing supports `@username` tokens.
- Mention email notifications go through Convex Resend component + React Email templates from `@awn/email`.
- Mention push notifications go through Convex Expo Push Notifications component.

## File uploads

- R2 uploads use Convex R2 component signed upload URLs.
- Downloads use short-lived presigned URLs generated only after permission checks.

## Security practices implemented in scaffold

- Server-side role and board authorization checks on every mutation/query.
- Invite token validation includes expiration and one-time use enforcement.
- Pending users blocked from board access/posting.
- Presigned file delivery requires authenticated board access.
- Search and pagination rely on indexes instead of collection scans.

## Important setup notes

- WorkOS AuthKit email flow should be configured in WorkOS dashboard to use your Resend-backed sender/domain.
- Run `pnpm --filter @awn/convex dev` to generate Convex types and connect deployment.
- Mobile auth uses WorkOS PKCE with Expo AuthSession (`/user_management/authorize` and `/user_management/authenticate`).
- Add your mobile redirect URI (for example `awn://auth/callback`) to the WorkOS app redirect list.
- Web/mobile currently use `packages/convex/convex/api.ts` (`anyApi`) as a temporary shim. After Convex codegen, switch app imports to `convex/_generated/api` for strict typing.
