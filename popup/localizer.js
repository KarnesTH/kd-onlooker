/**
 * Returns the message for `key` with its placeholders replaced by `substitutions` in order.
 */
export function text(key, substitutions = []) {
    return browser.i18n.getMessage(key, substitutions.map(String));
}

/**
 * Returns `<key>One` for a count of 1, otherwise `key` with the count as the first substitution.
 */
export function countText(key, count, substitutions = []) {
    return count === 1 ? text(`${key}One`, substitutions) : text(key, [count, ...substitutions]);
}

/**
 * Joins items with the conjunction of the UI language ("a, b, and c").
 */
export function listText(items) {
    return new Intl.ListFormat(browser.i18n.getUILanguage(), { type: "conjunction" }).format(items);
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