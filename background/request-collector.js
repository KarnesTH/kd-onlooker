"use strict";

import {resolveCompany} from "./company-resolver.js";
import {resetTab, addRequest, updateRequest} from "./tab-store.js";
import {isIdCandidate, hash, observeIds} from "./id-tracker.js";

const MAX_BODY = 64 * 1024;
const MAX_PARAMS = 200;
const MAX_VALUE = 2048;
const MAX_DEPTH = 32;
const PROTOCOLS = ["http:", "https:", "ws:", "wss:"];

/**
 * Resets the tab on a top-level navigation. Every other third-party request is stored with its
 * parameters under the page URL of its top-level document; the identifier hashes of its parameters
 * are added afterward and recorded unless the tab is private.
 */
export const handleBeforeRequest = async (details) => {
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
    addRequest(details.tabId, topUrl(details), {
        requestId: details.requestId,
        recipientKey: recipient.key,
        url: details.url,
        host: url.hostname,
        method: details.method,
        timeStamp: details.timeStamp,
        params,
        cookies: [],
        referer: null,
        origin: null
    });

    const hashed = await Promise.all(params.map(withIdHashes));
    if (!hashed.some((param) => param.idHashes)) return;
    updateRequest(details.tabId, details.requestId, details.url, {params: hashed});
    observe(details, recipient.key, hashed.flatMap((param) => param.idHashes ?? []));
};

/**
 * Attaches Cookie (names, value hashes, and identifier hashes), Referer, and Origin to the stored request
 * of the same hop and records the identifier hashes of the cookies.
 */
export const handleSendHeaders = async (details) => {
    if (details.tabId < 0 || !details.thirdParty || details.type === "main_frame") return;

    const headers = new Map(details.requestHeaders.map((header) => [header.name.toLowerCase(), header.value ?? ""]));
    const cookies = await parseCookies(headers.get("cookie") ?? "");
    updateRequest(details.tabId, details.requestId, details.url, {
        cookies,
        referer: headers.get("referer") ?? null,
        origin: headers.get("origin") ?? null
    });

    const recipient = resolveCompany(new URL(details.url).hostname);
    observe(details, recipient.key, cookies.flatMap((cookie) => cookie.idHash ? [cookie.idHash] : []));
};

/**
 * Returns the URL of the top-level document that sent the request, or `null`.
 */
export const topUrl = (details) => {
    return details.frameAncestors?.at(-1)?.url ?? details.documentUrl ?? null;
};

/**
 * Records identifier hashes for the site of the request's top-level document; private tabs and
 * requests without a known document are skipped.
 */
export const observe = (details, recipientKey, idHashes) => {
    const page = topUrl(details);
    if (details.incognito || !page || idHashes.length === 0) return;
    observeIds(recipientKey, idHashes, new URL(page).hostname).catch(e => console.error(e));
};

const queryParams = (url) => {
    return [...url.searchParams].map(([key, value]) => param(key, value));
};

/**
 * Returns the parameters of a request body: form fields, JSON leaves (key = dotted path),
 * URL-encoded lines, or the whole text under the key "(body)".
 */
const bodyParams = (requestBody) => {
    if (!requestBody) return [];
    if (requestBody.formData) {
        return Object.entries(requestBody.formData).flatMap(([key, values]) => values.map((value) => param(key, value)));
    }
    if (!requestBody.raw) return [];

    const text = rawText(requestBody.raw).trim();
    if (!text) return [];
    if (/^[[{]/.test(text)) {
        try {
            return jsonLeaves(JSON.parse(text), "", [], 0);
        } catch {
            // not JSON, handled as text below
        }
    }
    if (/^[^\s=&]+=/.test(text)) {
        return text.split(/\r?\n/).flatMap((line) => [...new URLSearchParams(line)].map(([key, value]) => param(key, value)));
    }
    return [param("(body)", text)];
};

/**
 * Joins the byte parts of a raw body up to MAX_BODY bytes and decodes them as UTF-8.
 */
const rawText = (raw) => {
    const joined = new Uint8Array(MAX_BODY);
    let size = 0;
    for (const part of raw) {
        if (!part.bytes || size >= MAX_BODY) continue;
        const bytes = new Uint8Array(part.bytes).subarray(0, MAX_BODY - size);
        joined.set(bytes, size);
        size += bytes.length;
    }
    return new TextDecoder().decode(joined.subarray(0, size));
};

/**
 * Collects the leaves of a JSON value into `leaves` (key = dotted path), at most MAX_PARAMS. Objects
 * and arrays below MAX_DEPTH are collected as `{…}` or `[…]`.
 */
const jsonLeaves = (node, path, leaves, depth) => {
    if (leaves.length >= MAX_PARAMS) return leaves;
    if (node === null || typeof node !== "object") {
        leaves.push(param(path || "(body)", String(node)));
        return leaves;
    }
    if (depth >= MAX_DEPTH) {
        leaves.push(param(path || "(body)", Array.isArray(node) ? "[…]" : "{…}"));
        return leaves;
    }
    for (const [key, value] of Object.entries(node)) jsonLeaves(value, path ? `${path}.${key}` : key, leaves, depth + 1);
    return leaves;
};

/**
 * Builds a parameter, cut to MAX_VALUE characters. Values that look like Base64 (16+ characters)
 * and decode to printable text get the decoded text in `decoded`.
 */
const param = (key, value) => {
    const entry = {key: String(key).slice(0, 200), value: String(value).slice(0, MAX_VALUE)};
    if (entry.value.length >= 16 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(entry.value)) {
        try {
            const decoded = atob(entry.value.replace(/-/g, "+").replace(/_/g, "/"));
            if (/^[\x20-\x7e\t\r\n]+$/.test(decoded)) entry.decoded = decoded;
        } catch {
            // not valid Base64
        }
    }
    return entry;
};

/**
 * Returns the parameter with `idHashes` (hashes of `key=value` for the value and the decoded value
 * that are identifier candidates); without candidates the parameter is returned unchanged.
 */
const withIdHashes = async (entry) => {
    const candidates = [entry.value, entry.decoded].filter(isIdCandidate);
    if (candidates.length === 0) return entry;
    return {...entry, idHashes: await Promise.all(candidates.map((value) => hash(`${entry.key}=${value}`)))};
};

/**
 * Splits a Cookie header into `{ name, valueHash, idHash }`; values are only kept as hashes, `idHash`
 * (hash of `name=value`) is set for identifier candidates, otherwise `null`.
 */
const parseCookies = async (header) => {
    const pairs = header.split(";").map((pair) => pair.trim()).filter(Boolean);
    return Promise.all(pairs.map(async (pair) => {
        const index = pair.indexOf("=");
        const name = index < 0 ? pair : pair.slice(0, index);
        const value = index < 0 ? "" : pair.slice(index + 1);
        return {
            name,
            valueHash: await hash(value),
            idHash: isIdCandidate(value) ? await hash(`${name}=${value}`) : null
        };
    }));
};