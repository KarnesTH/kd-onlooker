import { baseDomain } from "./company-resolver.js";

const MIN_TIME = Date.UTC(2000, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);
const MAX_PARTS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_VALUE = /^[A-Za-z_][\w.-]{0,40}=/;

/**
 * Reads the cookies of the base domains of `hosts` that are unpartitioned or partitioned for the
 * site of `pageHost`, and returns them sorted by name with their values split into parts.
 */
export async function readCookies(hosts, pageHost) {
    const site = baseDomain(pageHost);
    const domains = [...new Set(hosts.map((host) => baseDomain(host.toLowerCase())))];
    const lists = await Promise.all(domains.map((domain) =>
        browser.cookies.getAll({ domain, partitionKey: {}, firstPartyDomain: null }).catch(() => [])
    ));

    const seen = new Set();
    const cookies = [];
    for (const cookie of lists.flat()) {
        const partitionHost = cookie.partitionKey?.topLevelSite ? new URL(cookie.partitionKey.topLevelSite).hostname : null;
        if (partitionHost && baseDomain(partitionHost) !== site) continue;

        const id = `${cookie.domain}|${cookie.path}|${cookie.name}|${partitionHost}`;
        if (seen.has(id)) continue;
        seen.add(id);

        cookies.push({
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
        });
    }
    return cookies.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Splits a cookie value into `{ key, value, kind, decoded? time? }` parts: URL-decoded first,
 * then as key=value pairs, as `&`/`:`/`|` separated pieces, as dot-separated pieces (3+) or whole.
 */
export function splitValue(raw) {
    let value = raw;
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
        try {
            value = decodeURIComponent(value);
        } catch {
            // keeps the raw value
        }
    }

    let entries;
    const pieces = value.split(/[&:|;]/).filter(Boolean);
    if (pieces.length > 0 && pieces.every((piece) => KEY_VALUE.test(piece) && !/^=*$/.test(piece.slice(piece.indexOf("=") + 1)))) {
        entries = pieces.map((piece) => {
            const index = piece.indexOf("=");
            return [piece.slice(0, index), piece.slice(index + 1)];
        });
    } else if (pieces.length > 1) {
        entries = pieces.map((piece, index) => [String(index + 1), piece]);
    } else if (value.split(".").length >= 3 && value.split(".").every(Boolean)) {
        entries = value.split(".").map((piece, index) => [String(index + 1), piece]);
    } else {
        entries = [["1", value]];
    }

    return entries.slice(0, MAX_PARTS).map(([key, part]) => ({ key, value: part, ...classify(part) }));
}

/**
 * Returns the kind of value part: timestamp, identifier, text, or null (see docs/detection.md).
 */
function classify(value) {
    if (/^\d{10}$/.test(value) || /^\d{13}$/.test(value)) {
        const time = value.length === 10 ? Number(value) * 1000 : Number(value);
        if (time >= MIN_TIME && time < MAX_TIME) return { kind: "timestamp", time };
    }
    if (UUID.test(value)) return { kind: "identifier" };
    if (value.length >= 16 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
        try {
            const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
            if (/^[\x20-\x7e]{4,}$/.test(decoded)) return { kind: "text", decoded };
        } catch {
            // not valid Base64
        }
    }
    if (value.length >= 10 && value.length <= 512 && /\d/.test(value) && !/\s/.test(value)) return { kind: "identifier" };
    if (/^[\p{L} .,!?'"-]{4,}$/u.test(value)) return { kind: "text", decoded: value };
    return { kind: null };
}