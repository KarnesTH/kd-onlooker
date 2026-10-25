"use strict";

import {baseDomain} from "./company-resolver.js";
import {isIdCandidate, hash} from "./id-tracker.js";

const MAX_PARTS = 30;
const PAST_WINDOW = 10 * 365.25 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW = 2 * 365.25 * 24 * 60 * 60 * 1000;
const KEY_VALUE = /^[A-Za-z_][\w.-]{0,40}=/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_VALUE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Reads the cookies of the base domains of `hosts` that are unpartitioned or partitioned for the site
 * of `pageHost` and keeps those that were sent: a cookie matches `sent` (`{ name, valueHash }` from the
 * Cookie headers) by name and value hash; for a sent name without such a match, the cookies with that
 * name are kept. Returns them sorted by name with their values split into parts.
 */
export const readCookies = async (hosts, pageHost, sent) => {
    const site = baseDomain(pageHost);
    const domains = [...new Set(hosts.map((host) => baseDomain(host.toLowerCase())))];
    const lists = await Promise.all(domains.map((domain) =>
        browser.cookies.getAll({domain, partitionKey: {}, firstPartyDomain: null}).catch(() => [])
    ));

    const seen = new Set();
    const candidates = [];
    for (const cookie of lists.flat()) {
        const partitionHost = cookie.partitionKey?.topLevelSite ? new URL(cookie.partitionKey.topLevelSite).hostname : null;
        if (partitionHost && baseDomain(partitionHost) !== site) continue;

        const id = `${cookie.domain}|${cookie.path}|${cookie.name}|${partitionHost}`;
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push({cookie, partitionHost, valueHash: await hash(cookie.value)});
    }

    const sentPairs = new Set(sent.map((entry) => `${entry.name}=${entry.valueHash}`));
    const sentNames = new Set(sent.map((entry) => entry.name));
    const matchedNames = new Set(candidates
        .filter((entry) => sentPairs.has(`${entry.cookie.name}=${entry.valueHash}`))
        .map((entry) => entry.cookie.name));

    return candidates
        .filter((entry) => sentPairs.has(`${entry.cookie.name}=${entry.valueHash}`)
            || (sentNames.has(entry.cookie.name) && !matchedNames.has(entry.cookie.name)))
        .map(({cookie, partitionHost}) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            session: cookie.session,
            expirationDate: cookie.expirationDate ?? null,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            partitionSite: partitionHost ? site : null,
            parts: splitValue(cookie.value)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Splits a cookie value into `{ key, value, kind, decoded?, time? }` parts. The value is URL-decoded
 * first; JSON is split into its leaves (key = dotted path), dates and URLs stay whole, otherwise it is
 * split into key=value pairs, into `&`/`:`/`|` separated pieces, into dot-separated pieces (3+) or kept whole.
 */
export const splitValue = (raw) => {
    let value = raw;
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
        try {
            value = decodeURIComponent(value);
        } catch {
            // keeps the raw value
        }
    }
    return valueEntries(value).slice(0, MAX_PARTS).map(([key, part]) => ({key, value: part, ...classify(part)}));
};

const valueEntries = (value) => {
    if (/^[[{]/.test(value)) {
        try {
            return jsonEntries(JSON.parse(value), "", []);
        } catch {
            // not JSON, split below
        }
    }
    if (ISO_DATE.test(value) || URL_VALUE.test(value)) return [["1", value]];

    const pieces = value.split(/[&:|;]/).filter(Boolean);
    if (pieces.length > 0 && pieces.every((piece) => KEY_VALUE.test(piece) && !/^=*$/.test(piece.slice(piece.indexOf("=") + 1)))) {
        return pieces.map((piece) => {
            const index = piece.indexOf("=");
            return [piece.slice(0, index), piece.slice(index + 1)];
        });
    }
    if (pieces.length > 1) return pieces.map((piece, index) => [String(index + 1), piece]);
    const dotted = value.split(".");
    if (dotted.length >= 3 && dotted.every(Boolean)) return dotted.map((piece, index) => [String(index + 1), piece]);
    return [["1", value]];
};

/**
 * Collects the leaves of a JSON value as `[dotted path, text]` pairs, at most MAX_PARTS.
 */
const jsonEntries = (node, path, entries) => {
    if (entries.length >= MAX_PARTS) return entries;
    if (node === null || typeof node !== "object") {
        entries.push([path || "1", String(node)]);
        return entries;
    }
    for (const [key, value] of Object.entries(node)) jsonEntries(value, path ? `${path}.${key}` : key, entries);
    return entries;
};

/**
 * Returns the kind of value part: timestamp, text (Base64 that decodes to printable text, or words
 * separated by spaces), identifier (see `isIdCandidate`), or null.
 */
const classify = (value) => {
    const time = timestampOf(value);
    if (time !== null) return {kind: "timestamp", time};
    if (value.length >= 16 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
        try {
            const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
            if (/^[\x20-\x7e]{4,}$/.test(decoded)) return {kind: "text", decoded};
        } catch {
            // not valid Base64
        }
    }
    if (isIdCandidate(value)) return {kind: "identifier"};
    if (/^[\p{L}.,!?'"-]+( [\p{L}.,!?'"-]+)+$/u.test(value)) return {kind: "text", decoded: value};
    return {kind: null};
};

/**
 * Returns the milliseconds of an ISO date, or of 10 digits (seconds) or 13 digits (milliseconds)
 * between PAST_WINDOW before and FUTURE_WINDOW after now; otherwise `null`.
 */
const timestampOf = (value) => {
    if (ISO_DATE.test(value)) {
        const time = Date.parse(value);
        return Number.isNaN(time) ? null : time;
    }
    if (!/^(\d{10}|\d{13})$/.test(value)) return null;
    const time = value.length === 10 ? Number(value) * 1000 : Number(value);
    const now = Date.now();
    return time >= now - PAST_WINDOW && time <= now + FUTURE_WINDOW ? time : null;
};