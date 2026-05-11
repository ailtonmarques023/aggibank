'use strict';

function safeDecode(s) {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, '%20'));
  } catch (_) {
    return String(s || '');
  }
}

function splitUrl(url) {
  const u = String(url || '');
  const idx = u.indexOf('?');
  if (idx < 0) return { pathname: u || '/', query: '' };
  return { pathname: u.slice(0, idx) || '/', query: u.slice(idx + 1) || '' };
}

function isSensitiveQueryKey(keyLower) {
  if (!keyLower) return false;
  return (
    keyLower === 'efiwk' ||
    keyLower === 'token' ||
    keyLower === 'authorization' ||
    keyLower === 'client_secret' ||
    keyLower === 'clientsecret' ||
    keyLower === 'certificate' ||
    keyLower === 'certificado' ||
    keyLower === 'base64'
  );
}

function sanitizeUrlForAccessLog(originalUrl) {
  const { pathname, query } = splitUrl(originalUrl);
  if (!query) return pathname || '/';

  const parts = String(query).split('&').filter((p) => p !== '');
  if (parts.length === 0) return pathname || '/';

  const out = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    const rawKey = eq >= 0 ? p.slice(0, eq) : p;
    const rawVal = eq >= 0 ? p.slice(eq + 1) : '';

    const key = safeDecode(rawKey);
    const keyLower = String(key).toLowerCase();

    if (keyLower === 'authorization') {
      // Nunca logar Authorization mesmo que apareça na query.
      continue;
    }

    if (isSensitiveQueryKey(keyLower) || keyLower.includes('secret') || keyLower.includes('cert')) {
      out.push(`${rawKey}=***`);
      continue;
    }

    // Mantém a forma original (inclusive valor vazio como `ignorar=`).
    if (eq >= 0) out.push(`${rawKey}=${rawVal}`);
    else out.push(rawKey);
  }

  if (out.length === 0) return pathname || '/';
  return `${pathname || '/'}?${out.join('&')}`;
}

module.exports = {
  sanitizeUrlForAccessLog,
};

