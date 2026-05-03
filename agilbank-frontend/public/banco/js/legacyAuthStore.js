(function initLegacyAuthStore(window) {
    'use strict';

    const root = window.AgilBank = window.AgilBank || {};
    const TOKEN_KEYS = ['agilbank_token', 'govbr_token', 'token'];
    const USER_KEYS = ['agilbank_user', 'govbr_user'];
    const LOGIN_KEYS = ['agilbank_login', 'govbr_login'];

    function getStores(options) {
        if (options && options.sessionOnly) {
            return [window.sessionStorage];
        }

        return [window.sessionStorage, window.localStorage];
    }

    function readItem(store, key) {
        try {
            return store.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeItem(store, key, value) {
        try {
            store.setItem(key, value);
        } catch (error) {
            // Storage can fail in restricted browser modes.
        }
    }

    function removeItem(store, key) {
        try {
            store.removeItem(key);
        } catch (error) {
            // Storage can fail in restricted browser modes.
        }
    }

    function readFirst(keys, options) {
        const stores = getStores(options);

        for (const store of stores) {
            for (const key of keys) {
                const value = readItem(store, key);
                if (value) {
                    return value;
                }
            }
        }

        return null;
    }

    function stringifyUser(user) {
        if (!user) {
            return null;
        }

        return typeof user === 'string' ? user : JSON.stringify(user);
    }

    function parseUser(userData) {
        if (!userData) {
            return null;
        }

        try {
            return JSON.parse(userData);
        } catch (error) {
            return userData;
        }
    }

    function getToken(options) {
        return readFirst(TOKEN_KEYS, options);
    }

    function getUser(options) {
        return parseUser(readFirst(USER_KEYS, options));
    }

    function setSession(token, user) {
        const userData = stringifyUser(user);

        for (const store of getStores()) {
            for (const key of TOKEN_KEYS) {
                writeItem(store, key, token);
            }

            if (userData) {
                for (const key of USER_KEYS) {
                    writeItem(store, key, userData);
                }
            }
        }
    }

    function clearSession() {
        for (const store of getStores()) {
            for (const key of TOKEN_KEYS.concat(USER_KEYS, LOGIN_KEYS)) {
                removeItem(store, key);
            }
        }
    }

    root.auth = Object.assign({}, root.auth, {
        tokenKeys: TOKEN_KEYS.slice(),
        userKeys: USER_KEYS.slice(),
        getToken,
        getUser,
        setSession,
        clearSession
    });

    window.legacyAuthStore = root.auth;
})(window);
