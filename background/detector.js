"use strict";

import {resolveCompany} from "./company-resolver.js";
import {readTab} from "./tab-store.js";
import {lookupIds} from "./id-tracker.js";
import {readCookies} from "./cookie-reader.js";

const MIN_TITLE = 8;

/**
 * Builds the popup report of a tab: recipients with their findings and requests, sorted by the
 * number of findings. The page profile is requested from the content script of the tab. Without a
 * record, the status is "unavailable".
 */
export const buildReport = async (tabId) => {
    const record = await readTab(tabId);
    if (!record) return {status: "unavailable", pageHost: "", recognisingCount: 0, recipients: []};

    const groups = new Map();
    for (const request of record.requests) {
        if (!groups.has(request.recipientKey)) groups.set(request.recipientKey, []);
        groups.get(request.recipientKey).push(request);
    }

    const profile = await browser.tabs.sendMessage(tabId, {type: "getProfile"}, {frameId: 0}).catch(() => null);
    const matchers = profileMatchers(record.pageUrl, profile);
    const recipients = await Promise.all([...groups.values()].map((requests) => evaluateRecipient(requests, record, profile, matchers)));
    recipients.sort((a, b) => b.findings.length - a.findings.length || b.requests.length - a.requests.length);

    return {
        status: "ok",
        pageHost: record.pageHost,
        recognisingCount: recipients.filter((recipient) => recipient.findings.some((finding) => finding.kind === "identifier")).length,
        recipients
    };
};

/**
 * Collects the findings of one recipient from its requests, marks every parameter that carries
 * a finding, and adds the cookies the recipient was sent.
 */
const evaluateRecipient = async (requests, record, profile, matchers) => {
    const company = resolveCompany(requests[0].host);
    const findings = new Map();
    const cookieNames = new Set();
    const sentCookies = [];
    const paramsByHash = new Map();
    const shown = [];

    for (const request of requests) {
        const params = request.params.map((param) => ({key: param.key, value: param.value, hit: false}));

        request.params.forEach((param, index) => {
            for (const matcher of matchers) {
                if (matcher.test(param.value) || (param.decoded && matcher.test(param.decoded))) {
                    findings.set(matcher.kind, {kind: matcher.kind, value: matcher.value});
                    params[index].hit = true;
                }
            }
            for (const idHash of param.idHashes ?? []) {
                if (!paramsByHash.has(idHash)) paramsByHash.set(idHash, []);
                paramsByHash.get(idHash).push(params[index]);
            }
        });
        matchScreenPair(request, profile, params, findings);
        matchReferer(request, findings);

        for (const cookie of request.cookies) {
            cookieNames.add(cookie.name);
            sentCookies.push({name: cookie.name, valueHash: cookie.valueHash});
            if (cookie.idHash && !paramsByHash.has(cookie.idHash)) paramsByHash.set(cookie.idHash, []);
        }

        const url = new URL(request.url);
        shown.push({
            requestId: request.requestId,
            method: request.method,
            url: request.url,
            path: url.pathname + url.search,
            timeStamp: request.timeStamp,
            params,
            cookieCount: request.cookies.length,
            referer: request.referer,
            origin: request.origin
        });
    }

    if (cookieNames.size > 0) findings.set("cookies", {kind: "cookies", value: cookieNames.size});

    const hosts = [...new Set(requests.map((request) => request.host))];
    const [{otherSites, hits}, cookies] = await Promise.all([
        lookupIds(company.key, [...paramsByHash.keys()], record.pageHost),
        readCookies(hosts, record.pageHost, sentCookies)
    ]);
    if (otherSites > 0) {
        findings.set("identifier", {kind: "identifier", value: null, otherSites});
        for (const idHash of hits) {
            for (const param of paramsByHash.get(idHash)) param.hit = true;
        }
    }

    shown.sort((a, b) => a.timeStamp - b.timeStamp);
    return {
        key: company.key,
        name: company.name,
        known: company.known,
        hosts,
        findings: [...findings.values()],
        requests: shown,
        cookies
    };
};

/**
 * Returns `{ kind, value, test(value) }` for page, title, screen, language and time zone. The page
 * matcher is built from `pageUrl`; without a profile, it is the only matcher.
 */
export const profileMatchers = (pageUrl, profile) => {
    const page = new URL(pageUrl);
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
    if (title.length >= MIN_TITLE) {
        matchers.push({
            kind: "title",
            value: title,
            test: (value) => value.toLowerCase().includes(title.toLowerCase())
        });
    }

    const screen = new RegExp(`(^|\\D)${profile.screenWidth}\\s*[x*×,]\\s*${profile.screenHeight}(\\D|$)`, "i");
    matchers.push({
        kind: "screen",
        value: `${profile.screenWidth}x${profile.screenHeight}`,
        test: (value) => screen.test(value)
    });

    const language = profile.language.replace(/_/g, "-");
    if (language.includes("-")) {
        const pattern = new RegExp(`(^|[^a-z])${language.replace(/-/g, "[-_]")}([^a-z]|$)`, "i");
        matchers.push({kind: "language", value: language, test: (value) => pattern.test(value)});
    } else if (language) {
        matchers.push({
            kind: "language",
            value: language,
            test: (value) => value.trim().toLowerCase() === language.toLowerCase()
        });
    }

    const timeZone = profile.timeZone;
    if (timeZone.length >= 4) {
        matchers.push({
            kind: "timezone",
            value: timeZone,
            test: (value) => value.toLowerCase().includes(timeZone.toLowerCase())
        });
    }
    return matchers;
};

/**
 * Adds the screen finding when width and height appear as two separate parameter values.
 */
const matchScreenPair = (request, profile, params, findings) => {
    if (!profile) return;
    const width = request.params.findIndex((param) => param.value === String(profile.screenWidth));
    const height = request.params.findIndex((param) => param.value === String(profile.screenHeight));
    if (width < 0 || height < 0) return;
    findings.set("screen", {kind: "screen", value: `${profile.screenWidth}x${profile.screenHeight}`});
    params[width].hit = true;
    params[height].hit = true;
};

/**
 * Adds the page finding when the Referer carries a path, not just the origin.
 */
const matchReferer = (request, findings) => {
    if (!request.referer) return;
    try {
        const referer = new URL(request.referer);
        if (referer.pathname.length > 1 || referer.search) {
            findings.set("page", {
                kind: "page",
                value: (referer.hostname.replace(/^www\./, "") + referer.pathname).replace(/\/$/, "")
            });
        }
    } catch {
        // malformed Referer header
    }
};