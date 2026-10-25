import { applyTexts } from "./dom.js";
import { renderOverview } from "./views/overview-view.js";
import { renderRecipient } from "./views/recipient-view.js";
import { renderTechnical } from "./views/technical-view.js";
import { renderEmpty } from "./views/empty-view.js";
import { renderUnavailable } from "./views/unavailable-view.js";

let tab = null;
let report = null;

/**
 * Fills the static texts, checks the active tab and the host permission, requests the report
 * from the background, and shows the first view.
 */
export async function start() {
    applyTexts(document.body);

    [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/.test(tab.url)) {
        renderUnavailable("internal");
        return;
    }
    if (!(await browser.permissions.contains({ origins: ["<all_urls>"] }))) {
        renderUnavailable("permission");
        return;
    }

    report = await browser.runtime.sendMessage({ type: "getReport", tabId: tab.id });
    if (report.status === "unavailable") {
        renderUnavailable("internal");
        return;
    }
    showOverview();
}

function showOverview() {
    if (report.recipients.length === 0) {
        renderEmpty(report.pageHost, reloadTab);
        return;
    }
    renderOverview(report, showRecipient);
}

function showRecipient(key) {
    renderRecipient(findRecipient(key), showOverview, () => showTechnical(key));
}

function showTechnical(key) {
    renderTechnical(findRecipient(key), () => showRecipient(key));
}

function findRecipient(key) {
    return report.recipients.find((recipient) => recipient.key === key);
}

function reloadTab() {
    browser.tabs.reload(tab.id);
    window.close();
}

start().then().catch(e => console.error(e));