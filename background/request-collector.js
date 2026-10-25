import { resolveCompany } from "./company-resolver.js";
import { resetTab, addRequest, attachHeaders, readTab } from "./tab-store.js";
import { isIdCandidate, hash, observeIds } from "./id-tracker.js";

const MAX_BODY = 64 * 1024;
const MAX_PARAMS = 200;
const MAX_VALUE = 2048;
const PROTOCOLS = ["http:", "https:", "ws:", "wss:"];

/**
 * Resets the tab on a top-level navigation; stores every third-party request of a tab and
 * records its identifier candidates.
 */
export async function handleBeforeRequest(details) {
    if (details.tabId < 0) return;
    if (details.type === "main_frame") {
        resetTab(details.tabId, details.url);
        return;
    }
    if (!details.thirdParty) return;

    const url = new URL(details.url);
    if (!PROTOCOLS.includes(url.protocol)) return;

    const recipient = resolveCompany(url.hostname);
    const params = [...queryParams(url), ...bodyParams(details.requestBody)].slice(0, MAX_PARAMS);
    addRequest(details.tabId, {
        requestId: details.requestId,
        recipientKey: recipient.key,
        url: details.url,
        host: url.hostname,
        path: url.pathname + url.search,
        method: details.method,
        type: details.type,
        timeStamp: details.timeStamp,
        params,
        cookies: [],
        referer: null,
        origin: null
    });

    const candidates = params.flatMap((param) => [param.value, param.decoded]).filter(isIdCandidate);
    observe(details.tabId, recipient.key, await Promise.all(candidates.map((value) => hash(value))));
}

/**
 * Attaches Cookie (names and value hashes), Referer, and Origin to a stored request.
 */
export async function handleSendHeaders(details) {
    if (details.tabId < 0 || !details.thirdParty || details.type === "main_frame") return;

    const headers = new Map(details.requestHeaders.map((header) => [header.name.toLowerCase(), header.value ?? ""]));
    const cookies = await parseCookies(headers.get("cookie") ?? "");
    attachHeaders(details.tabId, details.requestId, {
        cookies,
        referer: headers.get("referer") ?? null,
        origin: headers.get("origin") ?? null
    });

    const recipient = resolveCompany(new URL(details.url).hostname);
    observe(details.tabId, recipient.key, cookies.filter((cookie) => cookie.candidate).map((cookie) => cookie.valueHash));
}

async function observe(tabId, recipientKey, valueHashes) {
    if (valueHashes.length === 0) return;
    const record = await readTab(tabId);
    if (record) observeIds(recipientKey, valueHashes, record.pageHost);
}

function queryParams(url) {
    return [...url.searchParams].map(([key, value]) => param(key, value));
}

/**
 * Returns the parameters of a request body: form fields, JSON leaves (key = dotted path),
 * URL-encoded lines, or the whole text under the key "(body)".
 */
function bodyParams(requestBody) {
    if (!requestBody) return [];
    if (requestBody.formData) {
        return Object.entries(requestBody.formData).flatMap(([key, values]) => values.map((value) => param(key, value)));
    }
    if (!requestBody.raw) return [];

    const text = rawText(requestBody.raw).trim();
    if (!text) return [];
    if (/^[[{]/.test(text)) {
        try {
            return jsonLeaves(JSON.parse(text), "");
        } catch {
            // not JSON, handled as text below
        }
    }
    if (/^[^\s=&]+=/.test(text)) {
        return text.split(/\r?\n/).flatMap((line) => [...new URLSearchParams(line)].map(([key, value]) => param(key, value)));
    }
    return [param("(body)", text)];
}

/**
 * Joins the byte parts of a raw body up to MAX_BODY bytes and decodes them as UTF-8.
 */
function rawText(raw) {
    const joined = new Uint8Array(MAX_BODY);
    let size = 0;
    for (const part of raw) {
        if (!part.bytes || size >= MAX_BODY) continue;
        const bytes = new Uint8Array(part.bytes).subarray(0, MAX_BODY - size);
        joined.set(bytes, size);
        size += bytes.length;
    }
    return new TextDecoder().decode(joined.subarray(0, size));
}

function jsonLeaves(node, path) {
    if (node === null || typeof node !== "object") return [param(path || "(body)", String(node))];
    return Object.entries(node).flatMap(([key, value]) => jsonLeaves(value, path ? `${path}.${key}` : key));
}

/**
 * Builds a parameter, cut to MAX_VALUE characters. Values that look like Base64 (16+ characters)
 * and decode to printable text get the decoded text in `decoded`.
 */
function param(key, value) {
    const entry = { key: String(key).slice(0, 200), value: String(value).slice(0, MAX_VALUE) };
    if (entry.value.length >= 16 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(entry.value)) {
        try {
            const decoded = atob(entry.value.replace(/-/g, "+").replace(/_/g, "/"));
            if (/^[\x20-\x7e\t\r\n]+$/.test(decoded)) entry.decoded = decoded;
        } catch {
            // not valid Base64
        }
    }
    return entry;
}

/**
 * Splits a Cookie header into `{ name, valueHash, candidate }`; values are only kept as hashes.
 */
function parseCookies(header) {
    const pairs = header.split(";").map((pair) => pair.trim()).filter(Boolean);
    return Promise.all(pairs.map(async (pair) => {
        const index = pair.indexOf("=");
        const name = index < 0 ? pair : pair.slice(0, index);
        const value = index < 0 ? "" : pair.slice(index + 1);
        return { name, valueHash: await hash(value), candidate: isIdCandidate(value) };
    }));
}