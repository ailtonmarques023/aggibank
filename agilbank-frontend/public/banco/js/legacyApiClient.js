(function initLegacyApiClient(window) {
    'use strict';

    const root = window.AgilBank = window.AgilBank || {};
    /** Fallback se agilbankApiBase.js não carregar — mesma base que produção (legado + login + wizard). */
    const DEFAULT_API_BASE = 'https://aggibank-production.up.railway.app/api';

    /** GET em voo: mesma Promise base; cada chamador recebe `response.clone()` para poder ler o body. */
    const getInflight = new Map();

    function normalizeBaseUrl(baseUrl) {
        return String(baseUrl || DEFAULT_API_BASE).replace(/\/+$/, '');
    }

    function getBaseUrl() {
        if (typeof window.getAgilbankApiBase === 'function') {
            return normalizeBaseUrl(window.getAgilbankApiBase());
        }
        return normalizeBaseUrl(window.AGILBANK_API_BASE || DEFAULT_API_BASE);
    }

    function buildUrl(path) {
        if (/^https?:\/\//i.test(path)) {
            return path;
        }

        return `${getBaseUrl()}/${String(path).replace(/^\/+/, '')}`;
    }

    function getToken() {
        return root.auth && typeof root.auth.getToken === 'function'
            ? root.auth.getToken()
            : null;
    }

    function normalizeDedupePath(path) {
        var s = String(path || '');
        return s.replace(/^https?:\/\/[^/]+\/?/i, '').replace(/\?.*$/, '');
    }

    function dedupeKey(method, path) {
        return method + ':' + normalizeDedupePath(path);
    }

    function parseRetryAfterMs(response) {
        var h = response && response.headers ? response.headers.get('Retry-After') : null;
        var sec = parseInt(h || '60', 10);
        if (!Number.isFinite(sec) || sec < 1) {
            sec = 60;
        }
        if (sec > 600) {
            sec = 600;
        }
        return sec * 1000;
    }

    function showRateLimitBanner(retryAfterSec) {
        try {
            if (window.__agilbankLegacyRateLimitBannerVisible) {
                return;
            }
            window.__agilbankLegacyRateLimitBannerVisible = true;
            var sec = Math.max(1, Math.round(Number(retryAfterSec) || 60));
            var bar = document.createElement('div');
            bar.setAttribute('role', 'status');
            bar.setAttribute('data-agilbank-rate-banner', '1');
            bar.style.cssText =
                'position:fixed;top:0;left:0;right:0;z-index:2147483646;padding:10px 14px;' +
                'background:#b45309;color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;' +
                'box-shadow:0 2px 8px rgba(0,0,0,.2);';
            bar.textContent =
                'Muitas consultas ao servidor em pouco tempo. Aguarde cerca de ' +
                sec +
                ' s e atualize a página. O limite visa proteger sua conta.';
            document.body.appendChild(bar);
        } catch (e) {
            console.warn('showRateLimitBanner:', e);
        }
    }

    function on429Response(response) {
        var ms = parseRetryAfterMs(response);
        window.__agilbankLegacyRateLimitedUntil = Date.now() + ms;
        try {
            window.dispatchEvent(
                new CustomEvent('agilbankApiRateLimited', {
                    detail: { retryAfterMs: ms, path: normalizeDedupePath(response && response.url ? response.url : '') }
                })
            );
        } catch (e) {
            /* ignore */
        }
        showRateLimitBanner(ms / 1000);
        console.warn(
            '[AgilBank][api] HTTP 429 — pausa sugerida no legado;',
            Math.round(ms / 1000),
            's (Retry-After / padrão)'
        );
    }

    function applyAfterFetch(response) {
        if (response.status !== 403) {
            if (response.status === 429) {
                on429Response(response);
            }
            return response;
        }
        return response
            .clone()
            .json()
            .then(function (data) {
                if (
                    data &&
                    data.code === 'ACCOUNT_NOT_VERIFIED' &&
                    typeof window.agilbankOnAccountNotVerified === 'function'
                ) {
                    try {
                        window.agilbankOnAccountNotVerified(data);
                    } catch (e) {
                        console.warn('agilbankOnAccountNotVerified:', e);
                    }
                }
                return response;
            })
            .catch(function () {
                return response;
            });
    }

    function syntheticNetworkFailureResponse(originalError) {
        try {
            var hint =
                originalError && originalError.message
                    ? String(originalError.message).slice(0, 200)
                    : 'fetch_failed';
            return new Response(
                JSON.stringify({
                    success: false,
                    message: 'Falha de rede ao contatar a API.',
                    code: 'NETWORK_FETCH_FAILED',
                    hint: hint,
                }),
                {
                    status: 503,
                    statusText: 'Network Unavailable',
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        } catch (_) {
            return new Response(null, { status: 503, statusText: 'Network Unavailable' });
        }
    }

    function runFetch(path, requestOptions, headers) {
        return window
            .fetch(buildUrl(path), Object.assign({}, requestOptions, { headers }))
            .then(function (response) {
                return applyAfterFetch(response);
            })
            .catch(function (err) {
                console.warn(
                    '[AgilBank][api] fetch falhou (rede/CORS/abort/timeout) — resposta sintética 503:',
                    normalizeDedupePath(path),
                    err
                );
                return syntheticNetworkFailureResponse(err);
            });
    }

    function request(path, options) {
        const requestOptions = Object.assign({}, options || {});
        const headers = Object.assign({}, requestOptions.headers || {});
        const token = requestOptions.auth === false ? null : getToken();

        if (token && !headers.Authorization) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (requestOptions.body && !headers['Content-Type'] && !(requestOptions.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        delete requestOptions.auth;

        const method = String(requestOptions.method || 'GET').toUpperCase();
        const key = dedupeKey(method, path);

        if (method !== 'GET') {
            return runFetch(path, requestOptions, headers);
        }

        if (!getInflight.has(key)) {
            var basePromise = runFetch(path, requestOptions, headers).finally(function () {
                getInflight.delete(key);
            });
            getInflight.set(key, basePromise);
        }

        return getInflight.get(key).then(function (response) {
            return response.clone();
        });
    }

    function clearLegacyRateLimitClientHints() {
        window.__agilbankLegacyRateLimitedUntil = 0;
        window.__agilbankLegacyRateLimitBannerVisible = false;
        var banners = document.querySelectorAll('[data-agilbank-rate-banner]');
        banners.forEach(function (el) {
            try {
                el.remove();
            } catch (e) {
                /* ignore */
            }
        });
    }

    root.api = Object.assign({}, root.api, {
        getBaseUrl,
        buildUrl,
        request,
        clearLegacyRateLimitClientHints
    });

    window.legacyApiClient = root.api;
})(window);
