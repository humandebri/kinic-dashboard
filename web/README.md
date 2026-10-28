# Kinic Memory Dashboard

Web UI for Kinic memories on the Internet Computer: list and manage memory canisters, insert documents, and search / ask with cited answers.

- **Frontend:** Vite + React 19 + React Router (SPA), Tailwind CSS, Radix UI
- **Hosting:** Cloudflare Workers (static assets + a Worker for `/api/*`)
- **API:** `POST /api/chat` — calls Gemini server-side so the API key never reaches the browser

## Development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # add GEMINI_API_KEY to use Ask
pnpm dev                          # http://localhost:3010 (Vite + local Workers runtime)
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm preview` (production build in workerd, with `_headers` applied).

## Deploy to Cloudflare

```bash
pnpm wrangler login
pnpm wrangler secret put GEMINI_API_KEY
pnpm run deploy
```

`wrangler.jsonc` configures:

- SPA fallback (`not_found_handling: "single-page-application"`); only `/api/*` runs the Worker first.
- `CHAT_RATE_LIMITER` — per-IP limit of 20 requests/minute on `/api/chat`.
- `GEMINI_MODEL` (default `gemini-3-flash-preview`).

Optional build-time variables (see `.env.example`): `VITE_EMBEDDING_ENDPOINT`, `VITE_DERIVATION_ORIGIN`, `VITE_OISY_SIGNER_URL`.
If you change the embedding endpoint or IC hosts, also update `connect-src` in `public/_headers`.

## Security notes

- `public/_headers` sets a strict CSP (scripts from self only), `frame-ancestors 'none'`, HSTS, and related headers.
  `connect-src` allows `http://127.0.0.1:*` because `/cli-login` hands the encrypted delegation to the local CLI.
- `/api/chat` accepts only same-origin JSON POSTs, caps body/question/source sizes, is rate limited, and never returns upstream error details.
- `/cli-login` accepts only `http://127.0.0.1/callback` callbacks, validates all parameters, and trusts `postMessage` only from the Internet Identity window it opened.
