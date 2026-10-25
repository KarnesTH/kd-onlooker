"use strict";

const KINDS = {
    identifier: {icon: "fingerprint", label: "Identifier", warn: true},
    page: {icon: "link", label: "Page", warn: false},
    title: {icon: "file-text", label: "Title", warn: false},
    screen: {icon: "device-desktop", label: "Screen", warn: false},
    language: {icon: "language", label: "Language", warn: false},
    timezone: {icon: "clock", label: "Timezone", warn: false},
    cookies: {icon: "cookie", label: "Cookies", warn: false}
};

const ORDER = Object.keys(KINDS);

export const findingIcon = (kind) => {
    return KINDS[kind].icon;
};

export const isWarning = (kind) => {
    return KINDS[kind].warn;
};

/**
 * Returns the message key of the short chip label (`chip<Kind>`).
 */
export const chipKey = (kind) => {
    return `chip${KINDS[kind].label}`;
};

/**
 * Returns the message key of the row title (`title<Kind>`).
 */
export const titleKey = (kind) => {
    return `title${KINDS[kind].label}`;
};

/**
 * Returns the findings of known kinds, sorted in display order.
 */
export const visibleFindings = (findings) => {
    return findings
        .filter((finding) => finding.kind in KINDS)
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
};