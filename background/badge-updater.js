"use strict";

const counts = new Map();

export const initBadge = () => {
    browser.action.setBadgeBackgroundColor({color: "#b210f2"}).catch(e => console.error(e));
    browser.action.setBadgeTextColor({color: "#ffffff"}).catch(e => console.error(e));
};

/**
 * Shows the number of distinct recipients of a tab on the toolbar icon; only changed counts are applied.
 */
export const updateBadge = (tabId, record) => {
    const count = record ? new Set(record.requests.map((request) => request.recipientKey)).size : 0;
    if (counts.get(tabId) === count) return;
    counts.set(tabId, count);

    browser.action.setBadgeText({tabId, text: count > 0 ? String(count) : ""}).catch(e => console.error(e));
    const title = count === 0
        ? browser.i18n.getMessage("extensionName")
        : count === 1
            ? browser.i18n.getMessage("badgeTitleOne")
            : browser.i18n.getMessage("badgeTitle", [String(count)]);
    browser.action.setTitle({tabId, title}).catch(e => console.error(e));
};

export const forgetBadge = (tabId) => {
    counts.delete(tabId);
};