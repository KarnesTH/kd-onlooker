"use strict";

import {baseDomain} from "./company-resolver.js";

const MAX_REQUESTS = 500;
const PERSIST_DELAY = 300;

const cache = new Map();
const queues = new Map();
const timers = new Map();
let changeListener = () => {
};

/**
 * Registers `listener(tabId, record)`, called after every change of a tab record.
 */
export const onTabChange = (listener) => {
    changeListener = listener;
};

/**
 * Starts a new record for a top-level navigation; a non-HTTP (S) page clears the record.
 */
export const resetTab = (tabId, pageUrl) => {
    return updateTab(tabId, () => newRecord(tabId, pageUrl));
};

/**
 * Starts a new record when the tab URL differs from the record's page URL, ignoring the fragment.
 * Non-HTTP (S) URLs leave the record unchanged.
 */
export const followUrl = (tabId, pageUrl) => {
    if (!pageUrl) return Promise.resolve();
    return updateTab(tabId, (record) => {
        if (!isWebUrl(pageUrl)) return undefined;
        if (record && withoutFragment(record.pageUrl) === withoutFragment(pageUrl)) return undefined;
        return newRecord(tabId, pageUrl);
    });
};

/**
 * Appends a request to the record of the tab. Without a record, one is started from `pageUrl`;
 * requests whose `pageUrl` belongs to another site than the record are dropped. Above MAX_REQUESTS
 * the oldest request is removed.
 */
export const addRequest = (tabId, pageUrl, request) => {
    return updateTab(tabId, (record) => {
        const current = record ?? (pageUrl ? newRecord(tabId, pageUrl) : null);
        if (!current) return undefined;
        if (pageUrl && siteOf(pageUrl) !== baseDomain(current.pageHost)) return undefined;
        current.requests.push(request);
        if (current.requests.length > MAX_REQUESTS) current.requests.shift();
        return current;
    });
};

/**
 * Merges `fields` into the last request with `requestId` and `url` (one entry per redirect hop).
 */
export const updateRequest = (tabId, requestId, url, fields) => {
    return updateTab(tabId, (record) => {
        /** @type {object | undefined} */
        const request = record?.requests.findLast((entry) => entry.requestId === requestId && entry.url === url);
        if (!request) return undefined;
        Object.assign(request, fields);
        return record;
    });
};

/**
 * Returns the record of a tab after all pending changes, or `null`.
 */
export const readTab = (tabId) => {
    return enqueue(tabId, () => load(tabId));
};

export const removeTab = (tabId) => {
    return enqueue(tabId, async () => {
        clearTimeout(timers.get(tabId));
        timers.delete(tabId);
        cache.delete(tabId);
        queues.delete(tabId);
        await browser.storage.session.remove(storageKey(tabId));
    });
};

/**
 * Persists all records with a pending persist timer immediately.
 */
export const flushTabs = () => {
    return Promise.all([...timers.keys()].map((tabId) => {
        clearTimeout(timers.get(tabId));
        return persist(tabId);
    }));
};

/**
 * Returns a new record for `pageUrl`, or `null` for non-HTTP (S) URLs.
 */
const newRecord = (tabId, pageUrl) => {
    if (!isWebUrl(pageUrl)) return null;
    return {tabId, pageUrl, pageHost: pageHostOf(pageUrl), startedAt: Date.now(), requests: []};
};

const isWebUrl = (url) => {
    return /^https?:/i.test(url);
};

const pageHostOf = (url) => {
    return new URL(url).hostname.replace(/^www\./, "");
};

const siteOf = (url) => {
    return isWebUrl(url) ? baseDomain(pageHostOf(url)) : null;
};

const withoutFragment = (url) => {
    return url.split("#")[0];
};

const storageKey = (tabId) => {
    return `tab:${tabId}`;
};

/**
 * Runs `change(record)` after all earlier operations of the tab. A returned record (or `null`) replaces
 * the stored one and is persisted with a short delay; `undefined` leaves everything unchanged.
 */
export const updateTab = (tabId, change) => {
    return enqueue(tabId, async () => {
        const updated = change(await load(tabId));
        if (updated === undefined) return;
        cache.set(tabId, updated);
        schedulePersist(tabId);
        changeListener(tabId, updated);
    });
};

const enqueue = (tabId, task) => {
    const next = (queues.get(tabId) ?? Promise.resolve()).then(task);
    queues.set(tabId, next.catch((error) => console.error("kd-onlooker:", error)));
    return next;
};

const load = async (tabId) => {
    if (!cache.has(tabId)) {
        const key = storageKey(tabId);
        const stored = await browser.storage.session.get(key);
        cache.set(tabId, stored[key] ?? null);
    }
    return cache.get(tabId);
};

const schedulePersist = (tabId) => {
    clearTimeout(timers.get(tabId));
    timers.set(tabId, setTimeout(() => persist(tabId), PERSIST_DELAY));
};

/**
 * Writes the cached record to `storage.session`, or removes the stored one when the record is `null`.
 */
export const persist = (tabId) => {
    timers.delete(tabId);
    const key = storageKey(tabId);
    const record = cache.get(tabId);
    const write = record ? browser.storage.session.set({[key]: record}) : browser.storage.session.remove(key);
    return write.catch((error) => console.error("kd-onlooker:", error));
};