/**
 * ALLOWED_ORIGIN is a comma-separated list. Entries may use a single-label
 * wildcard (`https://*.heartbeat.pages.dev`) so Cloudflare preview deploys work
 * without listing each one.
 *
 * Matching parses the URL rather than using endsWith, which would happily
 * accept `https://heartbeat.pages.dev.attacker.com`.
 */
export function resolveAllowedOrigin(origin: string | null, allowed: string): string | null {
  if (!origin) return null;

  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return null;
  }

  for (const raw of allowed.split(',')) {
    const pattern = raw.trim();
    if (!pattern) continue;

    if (!pattern.includes('*')) {
      if (pattern === origin) return origin;
      continue;
    }

    let base: URL;
    try {
      base = new URL(pattern.replace('*.', ''));
    } catch {
      continue;
    }
    if (candidate.protocol !== base.protocol) continue;
    // Exactly one extra label: a.example.com matches, a.b.example.com does not.
    const suffix = `.${base.hostname}`;
    if (!candidate.hostname.endsWith(suffix)) continue;
    const label = candidate.hostname.slice(0, -suffix.length);
    if (label && !label.includes('.')) return origin;
  }

  return null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin) headers['access-control-allow-origin'] = origin;
  return headers;
}
