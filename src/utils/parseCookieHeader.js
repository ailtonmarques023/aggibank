'use strict';

/**
 * Parser mínimo de Cookie (sem cookie-parser).
 * @param {string | undefined} header
 * @returns {Record<string, string>}
 */
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch (_) {
        out[key] = val;
      }
    }
  }
  return out;
}

module.exports = {
  parseCookieHeader,
};
