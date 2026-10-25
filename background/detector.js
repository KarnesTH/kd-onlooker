import { resolveCompany } from "./company-resolver.js";
import { readTab } from "./tab-store.js";
import { isIdCandidate, hash, lookupIds } from "./id-tracker.js";
import { readCookies } from "./cookie-reader.js";

/**
 * Builds the popup report of a tab: recipients with their findings and requests, sorted by the
 * number of findings. Without a record, the status is "unavailable".
 */
export async function buildReport(tabId) {
    const record = await readTab(tabId);
    if (!record) return { status: "unavailable", pageHost: "", recognisingCount: 0, recipients: [] };

    const groups = new Map();
    for (const request of record.requests) {
        if (!groups.has(request.recipientKey)) groups.set(request.recipientKey, []);
        groups.get(request.recipientKey).push(request);
    }

    const matchers = profileMatchers(record);
    const recipients = [];
    for (const requests of groups.values()) recipients.push(await evaluateRecipient(requests, record, matchers));
    recipients.sort((a, b) => b.findings.length - a.findings.length || b.requests.length - a.requests.length);

    return {
        status: "ok",
        pageHost: record.pageHost,
        recognisingCount: recipients.filter((recipient) => recipient.findings.some((finding) => finding.kind === "identifier")).length,
        recipients
    };
}

/**
 * Collects the findings of one recipient from its requests, marks every parameter that carries
 * a finding, and adds the recipient's cookies.
 */
async function evaluateRecipient(requests, record, matchers) {
    const company = resolveCompany(requests[0].host);
    const findings = new Map([["site", { kind: "site", value: record.pageHost }]]);
    const cookieNames = new Set();
    const paramsByHash = new Map();
    const shown = [];

    for (const request of requests) {
        const params = request.params.map((param) => ({ key: param.key, value: param.value, hit: false }));

        request.params.forEach((param, index) => {
            for (const matcher of matchers) {
                if (matcher.test(param.value) || (param.decoded && matcher.test(param.decoded))) {
                    findings.set(matcher.kind, { kind: matcher.kind, value: matcher.value });
                    params[index].hit = true;
                }
            }
        });
        matchScreenPair(request, record.profile, params, findings);
        matchReferer(request, findings);

        for (const cookie of request.cookies) {
            cookieNames.add(cookie.name);
            if (cookie.candidate && !paramsByHash.has(cookie.valueHash)) paramsByHash.set(cookie.valueHash, []);
        }
        for (const [index, param] of request.params.entries()) {
            for (const value of [param.value, param.decoded]) {
                if (!isIdCandidate(value)) continue;
                const valueHash = await hash(value);
                if (!paramsByHash.has(valueHash)) paramsByHash.set(valueHash, []);
                paramsByHash.get(valueHash).push(params[index]);
            }
        }

        shown.push({
            requestId: request.requestId,
            method: request.method,
            url: request.url,
            path: request.path,
            timeStamp: request.timeStamp,
            params,
            cookieCount: request.cookies.length,
            referer: request.referer,
            origin: request.origin
        });
    }

    if (cookieNames.size > 0) findings.set("cookies", { kind: "cookies", value: cookieNames.size });

    const { otherSites, hits } = await lookupIds(company.key, [...paramsByHash.keys()], record.pageHost);
    if (otherSites > 0) {
        findings.set("identifier", { kind: "identifier", value: null, otherSites });
        for (const valueHash of hits) {
            for (const param of paramsByHash.get(valueHash)) param.hit = true;
        }
    }

    shown.sort((a, b) => a.timeStamp - b.timeStamp);
    const hosts = [...new Set(requests.map((request) => request.host))];
    return {
        key: company.key,
        name: company.name,
        known: company.known,
        hosts,
        findings: [...findings.values()],
        requests: shown,
        cookies: await readCookies(hosts, record.pageHost)
    };
}

/**
 * Returns `{ kind, value, test(value) }` for page, title, screen, language, time zone, and user
 * agent. Without a profile, only the page matcher based on the navigation URL is returned.
 */
function profileMatchers(record) {
    const profile = record.profile;
    const page = new URL(profile?.url ?? record.pageUrl);
    const fullUrl = (page.origin + page.pathname + page.search).replace(/\/$/, "").toLowerCase();
    const hostPath = (page.hostname + page.pathname).replace(/\/$/, "").toLowerCase();
    const path = page.pathname.replace(/\/$/, "").toLowerCase();
    const matchers = [{
        kind: "page",
        value: (page.hostname.replace(/^www\./, "") + page.pathname).replace(/\/$/, ""),
        test: (value) => {
            const lower = value.toLowerCase();
            return lower.includes(fullUrl) || (path.length >= 2 && (lower.includes(hostPath) || lower === path));
        }
    }];
    if (!profile) return matchers;

    const title = profile.title.trim();
    if (title.length >= 4) {
        matchers.push({ kind: "title", value: title, test: (value) => value.toLowerCase().includes(title.toLowerCase()) });
    }

    const screen = new RegExp(`(^|\\D)${profile.screenWidth}\\s*[x*×,]\\s*${profile.screenHeight}(\\D|$)`, "i");
    matchers.push({ kind: "screen", value: `${profile.screenWidth}x${profile.screenHeight}`, test: (value) => screen.test(value) });

    const language = profile.language.replace(/_/g, "-");
    if (language.includes("-")) {
        const pattern = new RegExp(`(^|[^a-z])${language.replace(/-/g, "[-_]")}([^a-z]|$)`, "i");
        matchers.push({ kind: "language", value: language, test: (value) => pattern.test(value) });
    }

    const timeZone = profile.timeZone;
    if (timeZone.length >= 4) {
        matchers.push({ kind: "timezone", value: timeZone, test: (value) => value.toLowerCase().includes(timeZone.toLowerCase()) });
    }

    matchers.push({ kind: "useragent", value: profile.userAgent, test: (value) => value.includes(profile.userAgent) });
    return matchers;
}

/**
 * Adds the screen finding when width and height appear as two separate parameter values.
 */
function matchScreenPair(request, profile, params, findings) {
    if (!profile) return;
    const width = request.params.findIndex((param) => param.value === String(profile.screenWidth));
    const height = request.params.findIndex((param) => param.value === String(profile.screenHeight));
    if (width < 0 || height < 0) return;
    findings.set("screen", { kind: "screen", value: `${profile.screenWidth}x${profile.screenHeight}` });
    params[width].hit = true;
    params[height].hit = true;
}

/**
 * Adds the page finding when the Referer carries a path, not just the origin.
 */
function matchReferer(request, findings) {
    if (!request.referer) return;
    try {
        const referer = new URL(request.referer);
        if (referer.pathname.length > 1 || referer.search) {
            findings.set("page", { kind: "page", value: (referer.hostname.replace(/^www\./, "") + referer.pathname).replace(/\/$/, "") });
        }
    } catch {
        // malformed Referer header
    }
}