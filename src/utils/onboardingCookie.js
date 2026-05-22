'use strict';

const ONBOARDING_SESSION_COOKIE_NAME = 'agilbank_onboarding_session';
const { normalizeBrowserOrigin } = require('./corsOrigins');

function shouldUseCrossSiteCookie() {
  const fe = normalizeBrowserOrigin(process.env.FRONTEND_URL);
  const api = normalizeBrowserOrigin(process.env.API_PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN);
  if (!fe) return false;
  if (!api) {
    return process.env.NODE_ENV === 'production';
  }
  return fe !== api;
}

function sessionMaxAgeSeconds() {
  const raw = parseInt(process.env.ONBOARDING_SESSION_MAX_AGE_SECONDS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30 * 60;
}

/**
 * @returns {import('express').CookieOptions}
 */
function buildOnboardingSessionCookieOptions() {
  const crossSite = shouldUseCrossSiteCookie();
  const secure =
    process.env.NODE_ENV === 'production' ||
    String(process.env.ONBOARDING_COOKIE_SECURE || '').toLowerCase().trim() === 'true' ||
    crossSite;

  return {
    httpOnly: true,
    secure,
    path: '/api/onboarding',
    maxAge: sessionMaxAgeSeconds(),
    sameSite: crossSite ? 'none' : 'lax',
  };
}

/**
 * @param {import('express').Response} res
 * @param {string} cookieValue
 */
function setOnboardingSessionCookie(res, cookieValue) {
  res.cookie(ONBOARDING_SESSION_COOKIE_NAME, cookieValue, buildOnboardingSessionCookieOptions());
}

/**
 * @param {import('express').Response} res
 */
function clearOnboardingSessionCookie(res) {
  const opts = buildOnboardingSessionCookieOptions();
  res.clearCookie(ONBOARDING_SESSION_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    path: opts.path,
    sameSite: opts.sameSite,
  });
}

/**
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function readOnboardingSessionCookie(req) {
  const parsed = req.cookies;
  if (parsed && parsed[ONBOARDING_SESSION_COOKIE_NAME]) {
    return String(parsed[ONBOARDING_SESSION_COOKIE_NAME]).trim() || null;
  }
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = String(header).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === ONBOARDING_SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

module.exports = {
  ONBOARDING_SESSION_COOKIE_NAME,
  buildOnboardingSessionCookieOptions,
  setOnboardingSessionCookie,
  clearOnboardingSessionCookie,
  readOnboardingSessionCookie,
};
