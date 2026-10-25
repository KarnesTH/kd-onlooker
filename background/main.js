import { handleBeforeRequest, handleSendHeaders } from "./request-collector.js";
import { onTabChange, setProfile, removeTab } from "./tab-store.js";
import { buildReport } from "./detector.js";
import { initBadge, updateBadge, forgetBadge } from "./badge-updater.js";

initBadge();
onTabChange(updateBadge);

browser.webRequest.onBeforeRequest.addListener(handleBeforeRequest, { urls: ["<all_urls>"] }, ["requestBody"]);
browser.webRequest.onSendHeaders.addListener(handleSendHeaders, { urls: ["<all_urls>"] }, ["requestHeaders"]);

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "pageProfile" && sender.tab && sender.frameId === 0) {
        setProfile(sender.tab.id, message.profile);
        return undefined;
    }
    if (message.type === "getReport") return buildReport(message.tabId);
    return undefined;
});

browser.tabs.onRemoved.addListener((tabId) => {
    forgetBadge(tabId);
    removeTab(tabId);
});