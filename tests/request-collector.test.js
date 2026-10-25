import {test} from "node:test";
import assert from "node:assert/strict";
import {installBrowserStub} from "./browser-stub.js";

installBrowserStub();
const {handleBeforeRequest, handleSendHeaders} = await import("../background/request-collector.js");
const {readTab} = await import("../background/tab-store.js");
const {lookupIds, hash, flushIds} = await import("../background/id-tracker.js");

const page = "https://www.example.com/article";

test("query and JSON body parameters are stored with identifier hashes", async () => {
    await handleBeforeRequest(navigation(1, page));
    await handleBeforeRequest(subresource(1, "https://www.google-analytics.com/g/collect?cid=1234567890.1698765432&v=2", {
        body: {event: "page_view", user: {id: "u-123456789"}}
    }));
    const [request] = (await readTab(1)).requests;
    assert.deepEqual(request.params.map((param) => param.key), ["cid", "v", "event", "user.id"]);
    assert.equal(request.params[0].idHashes[0], await hash("cid=1234567890.1698765432"));
    assert.equal(request.params[1].idHashes, undefined);
});

test("headers of a redirect hop land on that hop", async () => {
    await handleBeforeRequest(navigation(2, page));
    await handleBeforeRequest(subresource(2, "https://a.tracker.net/sync", {requestId: "sync"}));
    await handleBeforeRequest(subresource(2, "https://b.partner.net/sync", {requestId: "sync"}));
    await handleSendHeaders(headers(2, "https://b.partner.net/sync", "sync", "uid=abc123456789"));
    const [first, second] = (await readTab(2)).requests;
    assert.deepEqual(first.cookies, []);
    assert.equal(second.cookies[0].name, "uid");
    assert.equal(second.cookies[0].idHash, await hash("uid=abc123456789"));
});

test("a late request of the previous site is not stored but counted for its own site", async () => {
    await handleBeforeRequest(navigation(3, page));
    await handleBeforeRequest(subresource(3, "https://px.tracker.net/beacon?id=987654321012", {documentUrl: "https://old-site.org/"}));
    assert.equal((await readTab(3)).requests.length, 0);
    const idHash = await hash("id=987654321012");
    assert.equal((await lookupIds("tracker.net", [idHash], "example.com")).otherSites, 1);
});

test("identifiers of private tabs are not recorded", async () => {
    await handleBeforeRequest(navigation(4, page));
    await handleBeforeRequest(subresource(4, "https://px.private-tracker.net/p?id=555555555555", {incognito: true}));
    assert.equal((await readTab(4)).requests.length, 1);
    const idHash = await hash("id=555555555555");
    assert.equal((await lookupIds("private-tracker.net", [idHash], "other.org")).otherSites, 0);
});

test("deeply nested JSON bodies are cut at the depth limit", async () => {
    await handleBeforeRequest(navigation(5, page));
    const deep = `${'{"a":'.repeat(5000)}"x"${"}".repeat(5000)}`;
    await handleBeforeRequest(subresource(5, "https://t.net/deep", {body: deep}));
    const [request] = (await readTab(5)).requests;
    assert.equal(request.params.length, 1);
    assert.equal(request.params[0].value, "{…}");
    await flushIds();
});

function navigation(tabId, url) {
    return {tabId, type: "main_frame", url};
}

function subresource(tabId, url, {requestId = url, documentUrl = page, incognito = false, body} = {}) {
    return {
        tabId,
        requestId,
        type: "xmlhttprequest",
        url,
        method: body ? "POST" : "GET",
        timeStamp: Date.now(),
        thirdParty: true,
        incognito,
        documentUrl,
        frameAncestors: [],
        requestBody: body ? {raw: [{bytes: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)).buffer}]} : null
    };
}

function headers(tabId, url, requestId, cookie) {
    return {
        tabId,
        requestId,
        type: "xmlhttprequest",
        url,
        thirdParty: true,
        incognito: false,
        documentUrl: page,
        frameAncestors: [],
        requestHeaders: [{name: "Cookie", value: cookie}, {name: "Referer", value: "https://www.example.com/"}]
    };
}