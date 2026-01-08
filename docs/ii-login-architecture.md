# Internet Identity CLI Login Overview

Where
- Component: rust/commands/ii_login/mod.rs
- Web page: web/src/app/cli-login/page.tsx
- Data store: ~/.config/kinic/identity.json (or --identity-path)

What
- The CLI opens a web login page that talks to Internet Identity.
- A local axum callback server receives encrypted delegations and stores them for future CLI calls.

Why
- Allows CLI-only login without relying on a keychain-backed dfx identity.

Flow (high level)
1) CLI generates a session key pair, nonce, and an ephemeral ECDH key pair, then starts a local HTTP listener on 127.0.0.1 with a random free port.
   - The session key is used to request a delegation from Internet Identity.
   - The nonce is embedded in the login URL and must match the callback payload.
   - The local listener is the callback endpoint for the browser to POST the encrypted delegation.
   - Binding to 127.0.0.1 ensures the callback is only reachable from the same machine.
2) CLI opens a web login page (e.g. https://app.example.com/cli-login) with query params:
   - callback URL, nonce, session public key, box public key, derivation origin, max TTL.
3) The web page opens the Internet Identity authorize flow and receives delegations.
4) The web page encrypts the delegation payload and POSTs it to the localhost callback.
5) CLI decrypts, validates (nonce/session key/origin), and stores the delegation bundle in ~/.config/kinic/identity.json (or --identity-path).
   - Stored fields include: identity provider URL, user public key, session key (pkcs8), delegations, expiration, created timestamp.
   - Delegations may include target canisters; those targets are preserved in the saved delegation list.

Server lifetime
- The callback server accepts a single successful callback, then exits.
- If no valid callback arrives before the timeout (default: 3 minutes), the login flow fails.

Key data exchanged
- Session public key (SPKI) from CLI to web login page.
- Encrypted payload from web page to CLI callback:
  - delegations, user public key, session public key, expiration, derivation origin.

Security notes
- The callback is bound to localhost only.
- Callback payloads are rejected if the nonce does not match.
- Delegations are verified against the session key before saving.
- Expiration is verified and stored to prevent stale reuse.
- On reuse, the CLI validates the stored file, checks expiration, and normalizes/verifies the delegation chain.
- Callback requests must be JSON and are capped at 256 KB.

Related files
- rust/commands/ii_login/mod.rs
- rust/commands/ii_login/http.rs
- rust/commands/ii_login/crypto.rs
- rust/commands/ii_login/payload.rs
- web/src/app/cli-login/page.tsx
- rust/identity_store.rs
