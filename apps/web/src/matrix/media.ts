/**
 * Matrix media URL resolution utilities.
 *
 * Uses /_matrix/client/v1/media/thumbnail/ with access_token query param,
 * which is still supported for direct <img src> usage.
 */

// ── mxc:// → authenticated thumbnail URL ────────────────────────────────────

/**
 * Convert an mxc:// URL to an authenticated thumbnail URL.
 *
 * Uses the client/v1/media endpoint with access_token so <img> can load it directly.
 */
export function mxcToAuthenticatedUrl(
  mxcUrl: string,
  homeserver: string,
  token: string,
  width = 96,
  height = 96,
): string {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return mxcUrl;
  const [, server, mediaId] = match;
  return (
    `${homeserver}/_matrix/client/v1/media/thumbnail/${server}/${mediaId}` +
    `?width=${width}&height=${height}&method=scale&allow_redirect=true` +
    `&access_token=${encodeURIComponent(token)}`
  );
}

// ── existing HTTP URL → v1 media thumbnail URL ───────────────────────────────

/**
 * Rewrite a legacy /media/v3/download or /media/r0/download URL
 * to the /client/v1/media/thumbnail endpoint and append access_token.
 */
export function toV1MediaUrl(url: string, token: string): string {
  const fixed = url
    .replace("/_matrix/media/v3/download/", "/_matrix/client/v1/media/thumbnail/")
    .replace("/_matrix/media/r0/download/", "/_matrix/client/v1/media/thumbnail/");
  const sep = fixed.includes("?") ? "&" : "?";
  return `${fixed}${sep}width=96&height=96&method=scale&allow_redirect=true&access_token=${encodeURIComponent(token)}`;
}

// ── Unified entry point ───────────────────────────────────────────────────────

/**
 * Resolve any avatar URL to a browser-loadable authenticated URL.
 *
 * - mxc://  → thumbnail URL via /_matrix/client/v1/media/thumbnail/
 * - https:// (legacy download path) → rewritten to v1 thumbnail endpoint
 * - https:// (other) → access_token appended as-is
 * - undefined → undefined
 */
export function resolveAvatarUrl(
  avatarUrl: string | undefined,
  homeserver: string,
  token: string,
): string | undefined {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith("mxc://")) {
    return mxcToAuthenticatedUrl(avatarUrl, homeserver, token);
  }
  // Already an HTTP URL — rewrite path if it's a legacy download URL
  return toV1MediaUrl(avatarUrl, token);
}
