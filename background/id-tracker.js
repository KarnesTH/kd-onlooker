const STORAGE_KEY = "ids";
const MAX_ENTRIES = 5000;
const MAX_SITES = 20;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SAVE_DELAY = 1000;

let entries = null;
let queue = Promise.resolve();
let saveTimer = null;

/**
 * Returns true for values that can be identifiers: 10–512 characters, at least one digit,
 * no whitespace, no slash, and no URL scheme.
 */
export function isIdCandidate(value) {
    return typeof value === "string"
        && value.length >= 10
        && value.length <= 512
        && /\d/.test(value)
        && !/[\s/]/.test(value)
        && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * Returns the first 32 hex characters of the SHA-256 digest of `text`.
 */
export async function hash(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * Records that the hashed values (`valueHashes`) reached `recipientKey` on `pageHost`.
 */
export function observeIds(recipientKey, valueHashes, pageHost) {
    if (valueHashes.length === 0) return Promise.resolve();
    return enqueue(async () => {
        const all = await load();
        const siteHash = await hash(pageHost);
        const now = Date.now();
        for (const valueHash of new Set(valueHashes)) {
            const id = `${recipientKey}:${await hash(`${recipientKey}:${valueHash}`)}`;
            const entry = all[id] ?? (all[id] = { siteHashes: [], lastSeen: 0 });
            if (!entry.siteHashes.includes(siteHash)) {
                entry.siteHashes.push(siteHash);
                if (entry.siteHashes.length > MAX_SITES) entry.siteHashes.shift();
            }
            entry.lastSeen = now;
        }
        prune(all, now);
        scheduleSave();
    });
}

/**
 * Returns `{ otherSites, hits }`: the highest number of other sites on which one of the hashed
 * values reached `recipientKey`, and the set of value hashes seen on at least one other site.
 */
export function lookupIds(recipientKey, valueHashes, pageHost) {
    return enqueue(async () => {
        const all = await load();
        const siteHash = await hash(pageHost);
        const hits = new Set();
        let otherSites = 0;
        for (const valueHash of new Set(valueHashes)) {
            const entry = all[`${recipientKey}:${await hash(`${recipientKey}:${valueHash}`)}`];
            const others = entry ? entry.siteHashes.filter((site) => site !== siteHash).length : 0;
            if (others > 0) hits.add(valueHash);
            otherSites = Math.max(otherSites, others);
        }
        return { otherSites, hits };
    });
}

function enqueue(task) {
    const next = queue.then(task);
    queue = next.catch((error) => console.error("kd-onlooker:", error));
    return next;
}

async function load() {
    if (!entries) {
        const stored = await browser.storage.local.get(STORAGE_KEY);
        entries = stored[STORAGE_KEY] ?? {};
    }
    return entries;
}

/**
 * Removes entries older than MAX_AGE, then the oldest entries above MAX_ENTRIES.
 */
function prune(all, now) {
    for (const [id, entry] of Object.entries(all)) {
        if (now - entry.lastSeen > MAX_AGE) delete all[id];
    }
    const ids = Object.keys(all);
    if (ids.length <= MAX_ENTRIES) return;
    ids.sort((a, b) => all[a].lastSeen - all[b].lastSeen);
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete all[id];
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        browser.storage.local.set({ [STORAGE_KEY]: entries });
    }, SAVE_DELAY);
}