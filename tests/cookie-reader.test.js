import {test} from "node:test";
import assert from "node:assert/strict";
import {installBrowserStub} from "./browser-stub.js";

const stub = installBrowserStub();
const {splitValue, readCookies} = await import("../background/cookie-reader.js");
const {hash} = await import("../background/id-tracker.js");

const nowSeconds = String(Math.floor(Date.now() / 1000));

test("GA cookie: random client ID is an identifier, the creation time a timestamp", () => {
    const parts = splitValue(`GA1.1.1234567890.${nowSeconds}`);
    assert.equal(parts[2].kind, "identifier");
    assert.equal(parts[3].kind, "timestamp");
});

test("URL-encoded JSON is split into its leaves", () => {
    const parts = splitValue(encodeURIComponent(JSON.stringify({id: 1234567890123, consent: {ads: false}})));
    assert.deepEqual(parts.map((part) => [part.key, part.value]), [["id", "1234567890123"], ["consent.ads", "false"]]);
});

test("ISO dates and URLs stay whole", () => {
    const date = splitValue("2026-10-25T10:00:00Z");
    assert.equal(date.length, 1);
    assert.equal(date[0].kind, "timestamp");
    assert.equal(splitValue("https://example.com/path?x=1").length, 1);
});

test("single words are no readable text, sentences are", () => {
    assert.equal(splitValue("granted")[0].kind, null);
    assert.equal(splitValue("true")[0].kind, null);
    assert.equal(splitValue("Hello dear visitor")[0].kind, "text");
});

test("key=value pairs keep their keys", () => {
    assert.deepEqual(splitValue("a=1&b=2").map((part) => part.key), ["a", "b"]);
});

test("readCookies keeps sent cookies of this site and drops other partitions", async () => {
    stub.jar = [
        cookie("uid", "first-party-value", null),
        cookie("uid", "partitioned-value", "https://example.com"),
        cookie("uid", "other-value", "https://other.org"),
        cookie("pref", "dark", null)
    ];
    const sent = [{name: "uid", valueHash: await hash("partitioned-value")}];
    const cookies = await readCookies(["px.tracker.net"], "www.example.com", sent);
    assert.deepEqual(cookies.map((entry) => [entry.name, entry.value, entry.partitionSite]), [["uid", "partitioned-value", "example.com"]]);
});

test("readCookies falls back to the name when the value changed after sending", async () => {
    stub.jar = [cookie("uid", "new-value", "https://example.com")];
    const sent = [{name: "uid", valueHash: await hash("old-value")}];
    const cookies = await readCookies(["tracker.net"], "example.com", sent);
    assert.deepEqual(cookies.map((entry) => entry.value), ["new-value"]);
});

function cookie(name, value, topLevelSite) {
    return {
        name,
        value,
        domain: ".tracker.net",
        path: "/",
        session: false,
        expirationDate: Date.now() / 1000 + 3600,
        secure: true,
        httpOnly: false,
        sameSite: "no_restriction",
        partitionKey: topLevelSite ? {topLevelSite} : undefined
    };
}