"use strict";

import {baseDomain} from "./company-resolver.js";

const STORAGE_KEY = "ids";
const SALT_KEY = "salt";
const MAX_ENTRIES = 5000;
const MAX_SITES = 20;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SAVE_DELAY = 10000;
const SITE_HASH_LENGTH = 4;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const VERSION = /^v?\d{1,4}(\.\d{1,4}){1,3}([-+][0-9a-z.]+)?$/i;
const SCREEN = /^\d{2,5}[x*×]\d{2,5}/i;
const LANGUAGE_LIST = /^[a-z]{2,3}([-_][a-z0-9]{2,8})*(,|;q=)/i;

let state = null;
let queue = Promise.resolve();
let saveTimer = null;

/**
 * Returns true for values shaped like identifiers: 10–512 characters without whitespace, slash, or URL
 * scheme, with at least eight digits or with letters and at least four digits. Dates, version numbers,
 * screen sizes, and language lists are rejected.
 */
export const isIdCandidate = (value) => {
    if (typeof value !== "string" || value.length < 10 || value.length > 512) return false;
    if (/[\s/]/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
    if (DATE.test(value) || VERSION.test(value) || SCREEN.test(value) || LANGUAGE_LIST.test(value)) return false;
    const digits = value.replace(/\D/g, "").length;
    return digits >= 8 || (digits >= 4 && /[a-z]/i.test(value));
};

/**
 * Returns the first 32 hex characters of the SHA-256 digest of `text`.
 */
export const hash = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return toHex(new Uint8Array(digest)).slice(0, 32);
};

/**
 * Records that the identifier hashes (`idHashes`) reached `recipientKey` on the site of `pageHost`.
 */
export const observeIds = (recipientKey, idHashes, pageHost) => {
    if (idHashes.length === 0) return Promise.resolve();
    return enqueue(async () => {
        const {entries, salt} = await load();
        const site = await siteHash(pageHost, salt);
        const now = Date.now();
        for (const idHash of new Set(idHashes)) {
            const key = `${recipientKey}:${idHash}`;
            const entry = entries[key] ?? (entries[key] = {siteHashes: [], lastSeen: 0});
            if (!entry.siteHashes.includes(site)) {
                entry.siteHashes.push(site);
                if (entry.siteHashes.length > MAX_SITES) entry.siteHashes.shift();
            }
            entry.lastSeen = now;
        }
        scheduleSave();
    });
};

/**
 * Returns `{ otherSites, hits }`: the highest number of other sites on which one of the identifier
 * hashes reached `recipientKey`, and the set of identifier hashes seen on at least one other site.
 */
export const lookupIds = (recipientKey, idHashes, pageHost) => {
    return enqueue(async () => {
        const {entries, salt} = await load();
        const site = await siteHash(pageHost, salt);
        const hits = new Set();
        let otherSites = 0;
        for (const idHash of new Set(idHashes)) {
            const entry = entries[`${recipientKey}:${idHash}`];
            const others = entry ? entry.siteHashes.filter((other) => other !== site).length : 0;
            if (others > 0) hits.add(idHash);
            otherSites = Math.max(otherSites, others);
        }
        return {otherSites, hits};
    });
};

/**
 * Writes pending sightings immediately.
 */
export const flushIds = () => {
    if (!saveTimer) return Promise.resolve();
    clearTimeout(saveTimer);
    return save();
};

/**
 * Returns the first SITE_HASH_LENGTH hex characters of the salted hash of the base domain of `pageHost`.
 */
const siteHash = async (pageHost, salt) => {
    return (await hash(`${salt}:${baseDomain(pageHost.toLowerCase())}`)).slice(0, SITE_HASH_LENGTH);
};

const enqueue = (task) => {
    const next = queue.then(task);
    queue = next.catch((error) => console.error("kd-onlooker:", error));
    return next;
};

/**
 * Loads sightings and salt once. A missing salt is generated and stored; sightings stored without a salt
 * are discarded.
 */
const load = async () => {
    if (!state) {
        const stored = await browser.storage.local.get([STORAGE_KEY, SALT_KEY]);
        const salt = stored[SALT_KEY] ?? toHex(crypto.getRandomValues(new Uint8Array(16)));
        if (!stored[SALT_KEY]) await browser.storage.local.set({[SALT_KEY]: salt, [STORAGE_KEY]: {}});
        state = {entries: stored[SALT_KEY] ? stored[STORAGE_KEY] ?? {} : {}, salt};
    }
    return state;
};

/**
 * Removes entries older than MAX_AGE, then the oldest entries above MAX_ENTRIES.
 */
const prune = (entries, now) => {
    for (const [key, entry] of Object.entries(entries)) {
        if (now - entry.lastSeen > MAX_AGE) delete entries[key];
    }
    const keys = Object.keys(entries);
    if (keys.length <= MAX_ENTRIES) return;
    keys.sort((a, b) => entries[a].lastSeen - entries[b].lastSeen);
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) delete entries[key];
};

/**
 * Starts the save timer unless one is pending, so sightings are written at most every SAVE_DELAY.
 */
const scheduleSave = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(save, SAVE_DELAY);
};

/**
 * Prunes the sightings and writes them to `storage.local`.
 */
const save = () => {
    saveTimer = null;
    prune(state.entries, Date.now());
    return browser.storage.local.set({[STORAGE_KEY]: state.entries})
        .catch((error) => console.error("kd-onlooker:", error));
};

const toHex = (bytes) => {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};