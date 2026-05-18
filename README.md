# Built Media

AI clipping platform that **routes** source video through best-in-class clipping engines (Opus Clip and others), captures captions and virality scores, and ships finished clips ready for Instagram/Facebook posting. Subscription-billed via Stripe. Built on the 1Commerce stack.

```
React/Vite/Tailwind  ──►  Netlify Functions  ──►  Supabase (Postgres + Auth + Realtime)
                                  │
                                  ├──►  Engine adapter ──►  Opus / Mock / future engines
                                  └──►  Stripe (billing + webhooks)
```

---

## TL;DR — get it live

```bash
# 1. Install deps
npm install
cd web && npm install && cd ..

# 2. Apply DB migration in Supabase
#    Either: paste supabase/migrations/20251101_init.sql into the Supabase SQL editor
#    Or: supabase link && supabase db push

# 3. Configure env
cp .env.example .env
#    Fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#             SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
#             VITE_STRIPE_PUBLISHABLE_KEY

# 4. Bootstrap Stripe products + prices
npx tsx scripts/setup-stripe.ts
#    Copy the printed STRIPE_PRICE_* env vars into .env

# 5. Local dev (frontend + functions together)
netlify dev
#    Open http://localhost:8888
```

Ships with **mock engine on by default** — you can sign up, submit a URL, and see fake-but-realistic clips render end-to-end with zero external API keys. Flip `CLIP_ENGINE=opus` and add `OPUS_API_KEY` to switch on the real engine.

---

## Project layout

```
built-media/
├── netlify.toml                 # routes /api/* to functions, SPA fallback
├── package.json                 # workspace root
├── .env.example
├── supabase/
│   └── migrations/
│       └── 20251101_init.sql    # full schema + RLS + triggers
├── netlify/functions/
│   ├── _shared/
│   │   ├── auth.ts              # JWT verification
│   │   ├── http.ts              # response helpers
│   │   ├── stripe.ts            # Stripe client + plan map
│   │   ├── supabase.ts          # service-role + user-scoped clients
│   │   └── engines/
│   │       ├── types.ts         # ClipEngine interface
│   │       ├── index.ts         # engine registry / selector
│   │       ├── mock.ts          # synthetic clips (default)
│   │       └── opus.ts          # Opus Clip adapter
│   ├── clip-create.ts           # POST /api/clips
│   ├── clip-list.ts             # GET  /api/clips
│   ├── clip-get.ts              # GET  /api/clips/:id
│   ├── me.ts                    # GET  /api/me
│   ├── checkout-session.ts      # POST /api/checkout
│   ├── webhook-stripe.ts        # POST /api/webhooks/stripe
│   └── webhook-opus.ts          # POST /api/webhooks/opus
├── web/                         # React/Vite/Tailwind frontend
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              # routing, auth gate
│       ├── lib/
│       │   ├── supabase.ts
│       │   └── api.ts
│       ├── components/Layout.tsx
│       └── pages/
│           ├── Landing.tsx
│           ├── Auth.tsx
│           ├── Dashboard.tsx    # URL submit, usage, realtime clip grid
│           ├── ClipDetail.tsx   # video player, download, caption copy
│           ├── Pricing.tsx      # Stripe Checkout
│           └── Settings.tsx
└── scripts/
    └── setup-stripe.ts          # idempotent products+prices bootstrap
```

---

## Adding a new clipping engine

The whole point of this codebase. To add Vizard, Klap, Submagic, etc:

1. Create `netlify/functions/_shared/engines/{name}.ts`. Export an object that conforms to `ClipEngine` from `./types.ts`. You implement three things:
   - `createJob(input)` — submit the job to the upstream API
   - `parseWebhook(headers, rawBody)` — verify signature + return a `WebhookEvent`
   - `getJobStatus(externalId)` (optional) — polling fallback
2. Register it in `engines/index.ts`:
   ```ts
   import { vizardEngine } from './vizard';
   const ENGINES = { mock, opus, vizard: vizardEngine };
   ```
3. Set `CLIP_ENGINE=vizard` (or pass `engine: 'vizard'` per-request from the frontend).

That's it. Frontend, billing, quota, and persistence layers don't change.

---

## Database schema (Supabase)

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | Extends `auth.users`, holds `stripe_customer_id` | User reads/updates own |
| `subscriptions` | Plan tier, status, monthly clip limit, billing period | User reads own; service role writes (via Stripe webhook) |
| `clips` | Job rows: source URL, engine, status, output JSON | User CRUD on own |
| `usage_events` | Append-only billing log | User reads own |

A trigger on `auth.users` insert auto-creates a `profiles` row + a `free`-tier subscription with 3 trial clips. A SQL function `clips_used_this_period(user_id)` powers quota enforcement.

The `clips` table is added to the `supabase_realtime` publication — the dashboard subscribes to row changes and updates the grid live as jobs progress.

---

## API surface

All endpoints require `Authorization: Bearer <supabase-jwt>` except webhooks.

| Method + path | Returns |
|---|---|
| `GET /api/me` | `{ user, profile, subscription, usage }` |
| `GET /api/clips?limit=50&offset=0` | `{ clips, total }` |
| `GET /api/clips/:id` | `{ clip }` |
| `POST /api/clips` body `{ source_url, engine? }` | `{ id, status, engine, clips }` |
| `POST /api/checkout` body `{ plan: 'starter'\|'pro'\|'studio' }` | `{ url }` (Stripe Checkout) |
| `POST /api/webhooks/stripe` | Stripe → syncs subscription state |
| `POST /api/webhooks/opus` | Opus → updates clip row on completion |

---

## Stripe webhook setup

```bash
# Local dev — forwards Stripe webhooks to your netlify dev server
stripe listen --forward-to localhost:8888/api/webhooks/stripe

# Copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET in .env

# Production — in Stripe Dashboard:
#   Webhooks → Add endpoint → https://<your-domain>/api/webhooks/stripe
#   Events: checkout.session.completed, customer.subscription.{created,updated,deleted}
#   Copy the signing secret into Netlify env var STRIPE_WEBHOOK_SECRET
```

---

## Supabase Auth — production redirect setup (REQUIRED)

After clicking the email-confirmation link, Supabase redirects the browser to whatever URL the client passed via `emailRedirectTo`. If that URL is **not in the project's allowlist**, Supabase silently falls back to the project's **Site URL** — which defaults to `http://localhost:3000` on a fresh project. Symptom: users finish signup, click "confirm", and land on a `localhost:3000/#access_token=…` page that obviously can't load.

In the Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://clips.1commerce.online`
- **Additional Redirect URLs** (one per line):
  - `https://clips.1commerce.online/**`
  - `http://localhost:8888/**` (for local `netlify dev`)
  - `http://localhost:5173/**` (for raw `vite dev`)

The frontend already builds `emailRedirectTo` from `window.location.origin`, so once the production origin is in the allowlist, post-confirmation lands on `/dashboard` correctly.

## Supabase Auth — email customization

Default Supabase auth emails come from `noreply@mail.app.supabase.io` — fine for testing, not for production trust.

In the Supabase dashboard → **Authentication → Email Templates**:
- Update "Confirm signup", "Magic Link", "Reset Password" templates with Built Media branding.

For a custom sender domain, configure SMTP under **Project Settings → Auth → SMTP Settings** (Resend, Postmark, or SendGrid all work). Use `noreply@1commerce.online`.

---

## Deploy to Netlify

```bash
# First time
netlify init
netlify link  # link to existing site if applicable

# Set env vars on the deployed site
netlify env:set VITE_SUPABASE_URL "https://..."
netlify env:set VITE_SUPABASE_ANON_KEY "eyJ..."
netlify env:set SUPABASE_SERVICE_ROLE_KEY "eyJ..."
netlify env:set STRIPE_SECRET_KEY "sk_..."
netlify env:set STRIPE_WEBHOOK_SECRET "whsec_..."
netlify env:set VITE_STRIPE_PUBLISHABLE_KEY "pk_..."
netlify env:set STRIPE_PRICE_STARTER "price_..."
netlify env:set STRIPE_PRICE_PRO     "price_..."
netlify env:set STRIPE_PRICE_STUDIO  "price_..."
netlify env:set CLIP_ENGINE "mock"  # flip to "opus" when ready
netlify env:set APP_URL "https://clips.1commerce.online"

# Deploy
netlify deploy --build --prod
```

DNS: in Cloudflare for `1commerce.online`, add a `CNAME` record `clips → <your-site>.netlify.app` with the proxy enabled (orange cloud). Netlify auto-provisions SSL once it sees the CNAME — usually 5–15 min.

---

## What's next

- **Real engine integration.** Get Opus API access. The adapter is ready; just need credentials and to verify the field-name mapping in `engines/opus.ts` against their actual payload (their docs change occasionally).
- **Direct Meta posting.** Add `POST /api/schedule` that takes `clip_id` + `caption` + `scheduled_at` and uses Meta Graph API to schedule directly to Instagram/Facebook from the dashboard. Requires Meta Business Suite OAuth flow.
- **Multi-engine routing logic.** Right now `CLIP_ENGINE` picks one. Smarter: route by source duration (Opus for >10min podcasts, Klap for shorter, etc.) — change `getEngine()` in `engines/index.ts`.
- **Overage billing.** The `usage_events` table is already structured for it; add a Stripe metered-usage price and report on period close.
- **White-label tier.** The Studio plan teases this. Add per-customer subdomains + branding overrides.

---

## License

Proprietary. Built Media is a 1Commerce LLC product.

---

## Admin UI — granting access

The app ships with a mobile-first admin console at `/admin` that lets operators view system KPIs, search users, change plans, retry/delete clip jobs, inspect engine + webhook health, and audit admin actions.

Access is gated by `profiles.is_admin = true`. To promote a user from the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

Apply the migration first if you upgraded from an earlier deploy:

```bash
# Paste supabase/migrations/20260518_admin.sql into the Supabase SQL editor,
# or run: supabase db push
```

Once `is_admin` is true:
1. Sign in normally.
2. An **Admin** link appears in the header.
3. Tap it to open the console. On mobile, primary sections (Overview / Users / Clips / System) live in a sticky bottom tab bar for thumb access.

Every mutating admin action (plan change, quota reset, disable, clip retry/delete, admin grant/revoke) is appended to `public.admin_actions` for audit.

