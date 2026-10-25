import {test} from "node:test";
import assert from "node:assert/strict";
import {installBrowserStub} from "./browser-stub.js";

const stub = installBrowserStub();
const {resetTab, followUrl, addRequest, updateRequest, readTab, flushTabs} = await import("../background/tab-store.js");

test("followUrl ignores fragment changes and resets on other URLs", async () => {
    await resetTab(1, "https://example.com/a");
    await addRequest(1, "https://example.com/a", request("r1", "https://t.net/1"));
    await followUrl(1, "https://example.com/a#top");
    assert.equal((await readTab(1)).requests.length, 1);
    await followUrl(1, "https://example.com/b");
    const record = await readTab(1);
    assert.equal(record.pageUrl, "https://example.com/b");
    assert.equal(record.requests.length, 0);
});

test("requests of another site are dropped, same-site requests kept", async () => {
    await resetTab(2, "https://www.example.com/");
    await addRequest(2, "https://old-site.org/page", request("r1", "https://t.net/beacon"));
    await addRequest(2, "https://shop.example.com/", request("r2", "https://t.net/pixel"));
    assert.deepEqual((await readTab(2)).requests.map((entry) => entry.requestId), ["r2"]);
});

test("a request without record starts one from its page URL", async () => {
    await addRequest(3, "https://example.com/start", request("r1", "https://t.net/1"));
    assert.equal((await readTab(3)).pageHost, "example.com");
});

test("updateRequest targets the redirect hop by URL", async () => {
    await resetTab(4, "https://example.com/");
    await addRequest(4, "https://example.com/", request("r1", "https://a.net/sync"));
    await addRequest(4, "https://example.com/", request("r1", "https://b.net/sync"));
    await updateRequest(4, "r1", "https://b.net/sync", {referer: "https://example.com/"});
    const [first, second] = (await readTab(4)).requests;
    assert.equal(first.referer, null);
    assert.equal(second.referer, "https://example.com/");
});

test("the oldest request is dropped above the limit", async () => {
    await resetTab(5, "https://example.com/");
    for (let index = 0; index < 501; index += 1) await addRequest(5, "https://example.com/", request(`r${index}`, "https://t.net/"));
    const requests = (await readTab(5)).requests;
    assert.equal(requests.length, 500);
    assert.equal(requests[0].requestId, "r1");
});

test("a non-web navigation clears the record and its stored copy", async () => {
    await resetTab(6, "https://example.com/");
    await flushTabs();
    assert.ok(stub.storage.session.data["tab:6"]);
    await resetTab(6, "about:blank");
    await flushTabs();
    assert.equal(await readTab(6), null);
    assert.equal(stub.storage.session.data["tab:6"], undefined);
});

function request(requestId, url) {
    return {
        requestId,
        url,
        recipientKey: new URL(url).hostname,
        host: new URL(url).hostname,
        params: [],
        cookies: [],
        referer: null,
        origin: null
    };
}