'use strict';

const DEFAULT_BROWSER_ORIGINS_PRODUCTION = ['https://www.aggilbank.com.br'];

function normalizeBrowserOrigin(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const noTrail = t.replace(/\/+$/, '');
  try {
    const url = noTrail.includes('://') ? noTrail : `https://${noTrail}`;
    return new URL(url).origin;
  } catch (_) {
    return noTrail;
  }
}

function parseAllowedCorsOrigins() {
  const list = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const corsRaw = String(process.env.CORS_ORIGIN || '').trim();
  if (corsRaw) {
    corsRaw.split(',').forEach((piece) => {
      const o = normalizeBrowserOrigin(piece);
      if (o && o !== '*' && !list.includes(o)) list.push(o);
    });
  }
  const fe = String(process.env.FRONTEND_URL || '').trim();
  if (fe) {
    const o = normalizeBrowserOrigin(fe);
    if (o && o !== '*' && !list.includes(o)) list.push(o);
  }
  if (isProduction) {
    DEFAULT_BROWSER_ORIGINS_PRODUCTION.forEach((o) => {
      if (o && !list.includes(o)) list.push(o);
    });
  }
  return list;
}

function isCorsAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

module.exports = {
  parseAllowedCorsOrigins,
  isCorsAllowedOrigin,
  normalizeBrowserOrigin,
};
