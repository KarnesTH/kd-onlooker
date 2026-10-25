"use strict";

import {applyTexts} from "./dom.js";
import {renderOverview} from "./views/overview-view.js";
import {renderRecipient} from "./views/recipient-view.js";
import {renderTechnical} from "./views/technical-view.js";
import {renderEmpty} from "./views/empty-view.js";
import {renderUnavailable} from "./views/unavailable-view.js";

let tab = null;
let report = null;

/**
 * Sets the document language to the UI language, fills the static texts, checks the active tab and
 * the host permission, requests the report from the background, and shows the first view.
 */
export const start = async () => {
    document.documentElement.lang = browser.i18n.getUILanguage();
    applyTexts(document.body);

    [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (!tab?.url || !/^https?:/.test(tab.url)) {
        renderUnavailable("internal");
        return;
    }
    if (!(await browser.permissions.contains({origins: ["<all_urls>"]}))) {
        renderUnavailable("permission");
        return;
    }

    report = await browser.runtime.sendMessage({type: "getReport", tabId: tab.id});
    if (report?.status !== "ok") {
        renderUnavailable("internal");
        return;
    }
    showOverview();
};

const showOverview = () => {
    if (report.recipients.length === 0) {
        renderEmpty(report.pageHost, reloadTab);
        return;
    }
    renderOverview(report, showRecipient);
};

const showRecipient = (key) => {
    renderRecipient(findRecipient(key), showOverview, () => showTechnical(key));
};

const showTechnical = (key) => {
    renderTechnical(findRecipient(key), () => showRecipient(key));
};

const findRecipient = (key) => {
    return report.recipients.find((recipient) => recipient.key === key);
};

const reloadTab = () => {
    browser.tabs.reload(tab.id).catch((error) => {
        console.error("kd-onlooker:", error);
        renderUnavailable("internal");
    });
    window.close();
};

(() => {
    start().catch((error) => {
        console.error("kd-onlooker:", error);
        renderUnavailable("internal");
    });
})();