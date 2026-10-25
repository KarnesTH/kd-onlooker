import {test} from "node:test";
import assert from "node:assert/strict";
import {installBrowserStub} from "./browser-stub.js";

const stub = installBrowserStub();
stub.storage.local.data.ids = {"google:legacy": {siteHashes: ["a".repeat(32), "b".repeat(32)], lastSeen: Date.now()}};
const {isIdCandidate, hash, observeIds, lookupIds, flushIds} = await import("../background/id-tracker.js");

test("isIdCandidate accepts identifier-shaped values", () => {
    for (const value of ["1234567890.1698765432", "a1b2c3d4e5f60718", "550e8400-e29b-41d4-a716-446655440000", "1698765432"]) {
        assert.equal(isIdCandidate(value), true, value);
    }
});

test("isIdCandidate rejects dates, versions, screen sizes, language lists and plain words", () => {
    for (const value of ["2024-10-25", "2024-10-25T10:00:00Z", "1.0.0-beta.12345", "v2.14.3", "1920x1080x24", "de-DE,de;q=0.9", "abcdefghijk", "https://x.com/123456789", "12 34 56 78 90", "build-12ab"]) {
        assert.equal(isIdCandidate(value), false, value);
    }
});

test("sightings stored without salt are discarded", async () => {
    const {otherSites} = await lookupIds("google", ["legacy"], "example.com");
    assert.equal(otherSites, 0);
    assert.match(stub.storage.local.data.salt, /^[0-9a-f]{32}$/);
});

test("subdomains of one site count as the same site", async () => {
    const idHash = await hash("cid=1234567890.1698765432");
    await observeIds("google", [idHash], "news.example.com");
    await observeIds("google", [idHash], "shop.example.com");
    assert.equal((await lookupIds("google", [idHash], "example.com")).otherSites, 0);
});

test("another site counts and returns the hit", async () => {
    const idHash = await hash("cid=1234567890.1698765432");
    await observeIds("google", [idHash], "other.org");
    const {otherSites, hits} = await lookupIds("google", [idHash], "www.example.com");
    assert.equal(otherSites, 1);
    assert.deepEqual([...hits], [idHash]);
    assert.equal((await lookupIds("meta", [idHash], "example.com")).otherSites, 0);
});

test("flushIds writes truncated salted site hashes", async () => {
    await flushIds();
    const entries = Object.values(stub.storage.local.data.ids);
    assert.ok(entries.length > 0);
    for (const entry of entries) {
        for (const site of entry.siteHashes) assert.match(site, /^[0-9a-f]{4}$/);
    }
    const plainHash = (await hash("example.com")).slice(0, 4);
    assert.ok(entries.every((entry) => !entry.siteHashes.includes(plainHash)));
});