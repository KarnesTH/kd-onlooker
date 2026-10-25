import {test} from "node:test";
import assert from "node:assert/strict";
import {resolveCompany, baseDomain} from "../background/company-resolver.js";

test("known hosts and their subdomains resolve to the company", () => {
    assert.deepEqual(resolveCompany("stats.g.doubleclick.net"), {key: "google", name: "Google", known: true});
    assert.equal(resolveCompany("T.CO").key, "x");
});

test("unknown hosts resolve to their base domain", () => {
    assert.deepEqual(resolveCompany("a.b.tracker.example"), {
        key: "tracker.example",
        name: "tracker.example",
        known: false
    });
});

test("baseDomain keeps generic second levels under country codes and IP addresses", () => {
    assert.equal(baseDomain("www.example.co.uk"), "example.co.uk");
    assert.equal(baseDomain("shop.example.com.au"), "example.com.au");
    assert.equal(baseDomain("news.example.de"), "example.de");
    assert.equal(baseDomain("192.168.0.1"), "192.168.0.1");
    assert.equal(baseDomain("[::1]"), "[::1]");
});