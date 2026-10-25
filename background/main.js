"use strict";

import {handleBeforeRequest, handleSendHeaders} from "./request-collector.js";
import {onTabChange, followUrl, removeTab, flushTabs} from "./tab-store.js";
import {flushIds} from "./id-tracker.js";
import {buildReport} from "./detector.js";
import {initBadge, updateBadge, forgetBadge} from "./badge-updater.js";

(() => {
    initBadge();
    onTabChange(updateBadge);

    browser.webRequest.onBeforeRequest.addListener(handleBeforeRequest, {urls: ["<all_urls>"]}, ["requestBody"]);
    browser.webRequest.onSendHeaders.addListener(handleSendHeaders, {urls: ["<all_urls>"]}, ["requestHeaders"]);

    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "getReport") return buildReport(message.tabId);
        return undefined;
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        followUrl(tabId, changeInfo.url);
    }, {properties: ["url"]});

    browser.tabs.onRemoved.addListener((tabId) => {
        forgetBadge(tabId);
        removeTab(tabId);
    });

    browser.runtime.onSuspend.addListener(() => {
        flushTabs().catch(e => console.error(e));
        flushIds();
    });
})();