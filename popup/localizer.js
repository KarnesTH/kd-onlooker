/**
 * Returns the message for `key` with its placeholders replaced by `substitutions` in order.
 */
export function text(key, substitutions = []) {
    return browser.i18n.getMessage(key, substitutions.map(String));
}

/**
 * Returns `<key>One` for a count of 1, otherwise `key` with the count as first substitution.
 */
export function countText(key, count, substitutions = []) {
    return count === 1 ? text(`${key}One`, substitutions) : text(key, [count, ...substitutions]);
}

/**
 * Returns the display name of a BCP 47 language tag in the UI language, or the tag itself.
 */
export function languageName(tag) {
    try {
        return new Intl.DisplayNames([browser.i18n.getUILanguage()], { type: "language" }).of(tag) ?? tag;
    } catch {
        return tag;
    }
}

/**
 * Formats a millisecond timestamp as local HH:MM:SS.
 */
export function timeText(timeStamp) {
    return new Intl.DateTimeFormat(browser.i18n.getUILanguage(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timeStamp);
}

/**
 * Formats a millisecond timestamp as local date and time.
 */
export function dateTimeText(timeStamp) {
    return new Intl.DateTimeFormat(browser.i18n.getUILanguage(), { dateStyle: "medium", timeStyle: "short" }).format(timeStamp);
}

/**
 * Returns the remaining lifetime of a cookie ("stays 13 months"): a unit is used from two whole
 * units on, otherwise the next smaller one. Without `expirationDate` (seconds) the session text.
 */
export function lifetimeText(expirationDate) {
    if (!expirationDate) return text("cookieSession");
    const minutes = Math.max(1, Math.round((expirationDate * 1000 - Date.now()) / 60000));
    const units = [["lifetimeYears", 525960], ["lifetimeMonths", 43830], ["lifetimeDays", 1440], ["lifetimeHours", 60]];
    for (const [key, size] of units) {
        const value = Math.floor(minutes / size);
        if (value >= 2) return countText(key, value);
    }
    return countText("lifetimeMinutes", minutes);
}