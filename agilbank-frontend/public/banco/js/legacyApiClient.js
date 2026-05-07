(function initLegacyApiClient(window) {
    'use strict';

    const root = window.AgilBank = window.AgilBank || {};
    /** Fallback se agilbankApiBase.js não carregar — mesma base que produção (legado + login + wizard). */
    const DEFAULT_API_BASE = 'https://aggibank-production.up.railway.app/api';

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

        return window
            .fetch(buildUrl(path), Object.assign({}, requestOptions, { headers }))
            .then(function (response) {
                if (response.status !== 403) {
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
            });
    }

    root.api = Object.assign({}, root.api, {
        getBaseUrl,
        buildUrl,
        request
    });

    window.legacyApiClient = root.api;
})(window);
