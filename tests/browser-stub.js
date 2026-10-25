/**
 * Installs a minimal `browser` global with in-memory storage areas, a cookie jar, and a stubbed
 * `tabs.sendMessage`, and returns it for inspection.
 */
export function installBrowserStub() {
    const stub = {
        storage: {local: storageArea(), session: storageArea()},
        jar: [],
        profile: null,
        cookies: {
            getAll: async ({domain}) => stub.jar.filter((cookie) => cookie.domain.replace(/^\./, "").endsWith(domain))
        },
        tabs: {
            sendMessage: async () => {
                if (!stub.profile) throw new Error("no content script");
                return stub.profile;
            }
        }
    };
    globalThis.browser = stub;
    return stub;
}

function storageArea() {
    const data = {};
    return {
        data,
        get: async (keys) => {
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
        },
        set: async (items) => {
            Object.assign(data, structuredClone(items));
        },
        remove: async (key) => {
            delete data[key];
        }
    };
}