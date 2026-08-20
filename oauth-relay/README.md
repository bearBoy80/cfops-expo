# cfops-oauth-relay

Cloudflare Worker that relays the Cloudflare OAuth authorization response into
the app. Cloudflare rejects private-use redirect URIs, so the OAuth client is
registered with this Worker's `https` URL and the Worker 302s the response to
`cfops://oauth/callback`.

The Worker is stateless and holds no secrets: the PKCE verifier stays on the
device and the token exchange happens directly between the app and
`https://dash.cloudflare.com/oauth2/token`.

## Deploy

```sh
cd oauth-relay
npm install
npx wrangler login
npm run deploy
```

Deployment prints the public URL, for example
`https://cfops-oauth-relay.<subdomain>.workers.dev`. Then:

1. Add `https://cfops-oauth-relay.<subdomain>.workers.dev/callback` to the
   OAuth client's redirect URIs in the Cloudflare dashboard.
2. Set the same value as `expo.extra.cloudflareOauth.redirectUri` in
   `app.json`. It must match byte for byte, including the `/callback` path;
   Cloudflare rejects the authorization request otherwise.

## Local development

```sh
npm run dev
curl -i "http://localhost:8787/callback?code=abc&state=xyz"
```

The response should be a `302` with
`Location: cfops://oauth/callback?code=abc&state=xyz`. A request with no `code`
and no `error` is rewritten to `error=invalid_response` so the app can tell a
malformed response apart from a cancelled sign-in.

To point the relay at another scheme (a dev client, say), change
`vars.APP_CALLBACK` in `wrangler.jsonc` or override it per environment.

## Behaviour

| Request                       | Response                                            |
| ----------------------------- | --------------------------------------------------- |
| `GET /callback?code&state`    | `302` to the app scheme with the response parameters |
| `GET /callback?error=...`     | `302` to the app scheme with the error parameters    |
| `GET /callback` (no params)   | `302` with `error=invalid_response`                  |
| Any other path                | `404`                                                |
| Non-`GET`/`HEAD` on `/callback` | `405`                                              |

Only `code`, `state`, `scope`, `error`, `error_description` and `error_uri` are
forwarded; other query parameters are dropped.
