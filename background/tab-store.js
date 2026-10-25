const MAX_REQUESTS = 500;
const PERSIST_DELAY = 300;

const cache = new Map();
const queues = new Map();
const timers = new Map();
let changeListener = () => {};

/**
 * Registers `listener(tabId, record)`, called after every change of a tab record.
 */
export function onTabChange(listener) {
    changeListener = listener;
}

/**
 * Starts a new record for a top-level navigation.
 */
export function resetTab(tabId, pageUrl) {
    return updateTab(tabId, () => ({
        tabId,
        pageUrl,
        pageHost: pageHostOf(pageUrl),
        startedAt: Date.now(),
        profile: null,
        requests: []
    }));
}

/**
 * Stores the page profile. Without a record (e.g., after installing the extension on an open page)
 * a new record is started from the profile URL.
 */
export function setProfile(tabId, profile) {
    return updateTab(tabId, (record) => {
        const base = record ?? { tabId, pageUrl: profile.url, pageHost: pageHostOf(profile.url), startedAt: Date.now(), requests: [] };
        return { ...base, profile };
    });
}

export function addRequest(tabId, request) {
    return updateTab(tabId, (record) => {
        if (!record || record.requests.length >= MAX_REQUESTS) return undefined;
        record.requests.push(request);
        return record;
    });
}

/**
 * Merges `headers` (`cookies`, `referer`, `origin`) into the request with `requestId`.
 */
export function attachHeaders(tabId, requestId, headers) {
    return updateTab(tabId, (record) => {
        const request = record?.requests.find((entry) => entry.requestId === requestId);
        if (!request) return undefined;
        Object.assign(request, headers);
        return record;
    });
}

/**
 * Returns the record of a tab after all pending changes, or `null`.
 */
export function readTab(tabId) {
    return enqueue(tabId, () => load(tabId));
}

export function removeTab(tabId) {
    return enqueue(tabId, async () => {
        clearTimeout(timers.get(tabId));
        timers.delete(tabId);
        cache.delete(tabId);
        queues.delete(tabId);
        await browser.storage.session.remove(storageKey(tabId));
    });
}

function pageHostOf(url) {
    return new URL(url).hostname.replace(/^www\./, "");
}

function storageKey(tabId) {
    return `tab:${tabId}`;
}

/**
 * Runs `change(record)` after all earlier operations of the tab. A returned record replaces the
 * stored one and is persisted with a short delay; `undefined` leaves everything unchanged.
 */
function updateTab(tabId, change) {
    return enqueue(tabId, async () => {
        const updated = change(await load(tabId));
        if (updated === undefined) return;
        cache.set(tabId, updated);
        schedulePersist(tabId);
        changeListener(tabId, updated);
    });
}

function enqueue(tabId, task) {
    const next = (queues.get(tabId) ?? Promise.resolve()).then(task);
    queues.set(tabId, next.catch((error) => console.error("kd-onlooker:", error)));
    return next;
}

async function load(tabId) {
    if (!cache.has(tabId)) {
        const key = storageKey(tabId);
        const stored = await browser.storage.session.get(key);
        cache.set(tabId, stored[key] ?? null);
    }
    return cache.get(tabId);
}

function schedulePersist(tabId) {
    clearTimeout(timers.get(tabId));
    timers.set(tabId, setTimeout(() => {
        timers.delete(tabId);
        const record = cache.get(tabId);
        if (record) browser.storage.session.set({ [storageKey(tabId)]: record });
    }, PERSIST_DELAY));
}