const KINDS = {
    identifier: { icon: "fingerprint", label: "Identifier", warn: true },
    page: { icon: "link", label: "Page", warn: false },
    title: { icon: "file-text", label: "Title", warn: false },
    screen: { icon: "device-desktop", label: "Screen", warn: false },
    language: { icon: "language", label: "Language", warn: false },
    timezone: { icon: "clock", label: "Timezone", warn: false },
    useragent: { icon: "browser", label: "Useragent", warn: false },
    cookies: { icon: "cookie", label: "Cookies", warn: false },
    site: { icon: "world", label: "Site", warn: false }
};

const ORDER = Object.keys(KINDS);

export function findingIcon(kind) {
    return KINDS[kind].icon;
}

export function isWarning(kind) {
    return KINDS[kind].warn;
}

/**
 * Returns the message key of the short chip label (`chip<Kind>`).
 */
export function chipKey(kind) {
    return `chip${KINDS[kind].label}`;
}

/**
 * Returns the message key of the row title (`title<Kind>`).
 */
export function titleKey(kind) {
    return `title${KINDS[kind].label}`;
}

/**
 * Returns the findings without `site`, sorted in display order.
 */
export function visibleFindings(findings) {
    return findings
        .filter((finding) => finding.kind !== "site")
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}