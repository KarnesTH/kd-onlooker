import {test} from "node:test";
import assert from "node:assert/strict";
import {installBrowserStub} from "./browser-stub.js";

const stub = installBrowserStub();
const {buildReport, profileMatchers} = await import("../background/detector.js");
const {handleBeforeRequest, handleSendHeaders} = await import("../background/request-collector.js");
const {flushIds} = await import("../background/id-tracker.js");

const page = "https://www.example.com/news/story";
const profile = {
    title: "Breaking story of the day",
    screenWidth: 1920,
    screenHeight: 1080,
    language: "de",
    timeZone: "Europe/Berlin"
};

test("a two-letter language counts only as an exact value", () => {
    const language = profileMatchers(page, profile).find((matcher) => matcher.kind === "language");
    assert.equal(language.test("de"), true);
    assert.equal(language.test("index"), false);
});

test("short titles get no matcher", () => {
    const matchers = profileMatchers(page, {...profile, title: "Home"});
    assert.equal(matchers.some((matcher) => matcher.kind === "title"), false);
});

test("report: profile findings, cookies sent along and recognition across sites", async () => {
    stub.profile = profile;
    stub.jar = [{
        name: "uid", value: "abc123456789", domain: ".tracker.net", path: "/", session: false,
        expirationDate: Date.now() / 1000 + 86400, secure: true, httpOnly: true, sameSite: "none",
        partitionKey: {topLevelSite: "https://example.com"}
    }, {
        name: "unsent", value: "x", domain: ".tracker.net", path: "/", session: true,
        secure: false, httpOnly: false, sameSite: "lax"
    }];

    await handleBeforeRequest(navigation(9, "https://other.org/"));
    await handleBeforeRequest(subresource(9, "https://px.tracker.net/p?uid=abc123456789", "https://other.org/"));

    await handleBeforeRequest(navigation(9, page));
    await handleBeforeRequest(subresource(9, `https://px.tracker.net/p?uid=abc123456789&sr=1920x1080&dt=${encodeURIComponent(profile.title)}&lang=de&tz=Europe%2FBerlin`, page));
    await handleSendHeaders({
        tabId: 9,
        requestId: "req",
        type: "image",
        thirdParty: true,
        incognito: false,
        documentUrl: page,
        frameAncestors: [],
        url: `https://px.tracker.net/p?uid=abc123456789&sr=1920x1080&dt=${encodeURIComponent(profile.title)}&lang=de&tz=Europe%2FBerlin`,
        requestHeaders: [{name: "Cookie", value: "uid=abc123456789"}]
    });

    const report = await buildReport(9);
    assert.equal(report.status, "ok");
    assert.equal(report.recognisingCount, 1);
    const [recipient] = report.recipients;
    assert.deepEqual(recipient.findings.map((finding) => finding.kind).sort(), ["cookies", "identifier", "language", "screen", "timezone", "title"]);
    assert.equal(recipient.findings.find((finding) => finding.kind === "identifier").otherSites, 1);
    assert.deepEqual(recipient.cookies.map((cookie) => cookie.name), ["uid"]);
    assert.equal(recipient.requests[0].path.startsWith("/p?uid="), true);
    assert.equal(recipient.requests[0].params.find((param) => param.key === "uid").hit, true);
    await flushIds();
});

test("report without content script falls back to the page matcher", async () => {
    stub.profile = null;
    await handleBeforeRequest(navigation(10, page));
    await handleBeforeRequest(subresource(10, `https://t.net/c?dl=${encodeURIComponent(page)}&sr=1920x1080`, page));
    const [recipient] = (await buildReport(10)).recipients;
    assert.deepEqual(recipient.findings.map((finding) => finding.kind), ["page"]);
});

function navigation(tabId, url) {
    return {tabId, type: "main_frame", url};
}

function subresource(tabId, url, documentUrl) {
    return {
        tabId, requestId: "req", type: "image", url, method: "GET", timeStamp: Date.now(),
        thirdParty: true, incognito: false, documentUrl, frameAncestors: [], requestBody: null
    };
}