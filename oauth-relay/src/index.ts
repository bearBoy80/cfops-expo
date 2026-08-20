/**
 * Cloudflare OAuth callback relay.
 *
 * Cloudflare only accepts `https` redirect URIs while the app can only be
 * re-entered through its private-use scheme. This Worker is what gets
 * registered on the OAuth client, and it does nothing but bounce the
 * authorization response back to the app. It never sees the PKCE verifier and
 * never talks to the token endpoint, so it holds no secrets.
 */

const DEFAULT_APP_CALLBACK = 'cfops://oauth/callback';

const CALLBACK_PATH = '/callback';

/**
 * Authorization response parameters from RFC 6749 §4.1.2. Everything else is
 * dropped so a crafted link cannot smuggle extra values into the app.
 */
const FORWARDED_PARAMS = [
  'code',
  'state',
  'scope',
  'error',
  'error_description',
  'error_uri',
] as const;

interface Env {
  /** Overrides the app deep link, e.g. for a dev client with another scheme. */
  APP_CALLBACK?: string;
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== CALLBACK_PATH) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        headers: { Allow: 'GET, HEAD' },
        status: 405,
      });
    }

    const appCallback = env.APP_CALLBACK?.trim() || DEFAULT_APP_CALLBACK;

    const forwarded = new URLSearchParams();
    for (const name of FORWARDED_PARAMS) {
      const value = url.searchParams.get(name);
      if (value !== null) {
        forwarded.set(name, value);
      }
    }

    // Never hand the app an empty callback: without this it cannot tell a
    // malformed response apart from a cancelled sign-in.
    if (!forwarded.has('code') && !forwarded.has('error')) {
      forwarded.set('error', 'invalid_response');
    }

    // Built by hand rather than via `Response.redirect`, which validates the
    // target as a fetchable URL and rejects private-use schemes.
    return new Response(null, {
      headers: {
        'Cache-Control': 'no-store',
        Location: `${appCallback}?${forwarded.toString()}`,
        'Referrer-Policy': 'no-referrer',
      },
      status: 302,
    });
  },
} satisfies ExportedHandler<Env>;
