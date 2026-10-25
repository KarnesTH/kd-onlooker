"use strict";

import {showView, field, setText, list, cloneTemplate, setIcon, initial} from "../dom.js";
import {text, countText, languageName, dateTimeText, lifetimeText} from "../localizer.js";
import {visibleFindings, isWarning, findingIcon, titleKey} from "../finding-kinds.js";

/**
 * Fills the recipient view; `onBack` returns to the overview, `onTechnical` opens the technical view.
 */
export const renderRecipient = (recipient, onBack, onTechnical) => {
    const view = showView("recipient");
    const findings = visibleFindings(recipient.findings);

    setText(view, "initial", initial(recipient.name));
    setText(view, "name", recipient.name);
    setText(view, "learned", countText("recipientLearned", findings.length));
    list(view, "facts").replaceChildren(...findings.map((finding) => fact(finding, recipient)));

    field(view, "notice").hidden = !findings.some((finding) => finding.kind === "identifier");
    setText(view, "noticeText", text("identifierInfo", [recipient.name]));
    renderCookies(view, recipient);
    const linkTexts = [countText("technicalLink", recipient.requests.length)];
    if (recipient.cookies.length > 0) linkTexts.push(countText("cookieCount", recipient.cookies.length));
    setText(view, "technicalText", linkTexts.join(" · "));

    field(view, "back").onclick = onBack;
    field(view, "technical").onclick = onTechnical;
};

/**
 * Fills the cookie section; hidden when the recipient has no cookies.
 */
const renderCookies = (view, recipient) => {
    const cookies = recipient.cookies;
    field(view, "cookies").hidden = cookies.length === 0;
    setText(view, "cookiesCount", countText("cookiesCount", cookies.length, [recipient.name]));
    const shared = cookies.some((cookie) => !cookie.partitionSite);
    setText(view, "cookiesHint", shared
        ? text("cookiesShared", [recipient.name])
        : text("cookiesPartitioned", [recipient.name, cookies[0]?.partitionSite ?? ""]));
    list(view, "cookies").replaceChildren(...cookies.map(cookieRow));
};

const cookieRow = (cookie) => {
    const row = cloneTemplate("tpl-cookie-row");
    setText(row, "name", cookie.name);
    setText(row, "lifetime", lifetimeText(cookie.session ? null : cookie.expirationDate));
    list(row, "chips").replaceChildren(...cookieChips(cookie.parts));
    return row;
};

/**
 * Returns chips for a cookie: one identifier chip, up to two timestamps, and up to two texts.
 */
const cookieChips = (parts) => {
    const chips = [];
    if (parts.some((part) => part.kind === "identifier")) {
        const chip = cloneTemplate("tpl-chip-warn");
        setIcon(field(chip, "icon"), "fingerprint");
        setText(chip, "label", text("partIdentifier"));
        chips.push(chip);
    }
    const times = [...new Set(parts.filter((part) => part.kind === "timestamp").map((part) => dateTimeText(part.time)))].slice(0, 2);
    const texts = [...new Set(parts.filter((part) => part.kind === "text").map((part) => part.decoded))].slice(0, 2);
    for (const time of times) chips.push(plainChip(text("partTimestamp", [time])));
    for (const decoded of texts) chips.push(plainChip(text("partText", [decoded])));
    return chips;
};

function plainChip(label) {
    const chip = cloneTemplate("tpl-chip");
    setText(chip, "label", label);
    return chip;
}

const fact = (finding, recipient) => {
    const row = cloneTemplate(isWarning(finding.kind) ? "tpl-fact-warn" : "tpl-fact");
    setIcon(field(row, "icon"), findingIcon(finding.kind));
    setText(row, "title", text(titleKey(finding.kind)));
    setText(row, "value", factValue(finding, recipient));
    return row;
};

/**
 * Formats the matched value of a finding for display.
 */
const factValue = (finding, recipient) => {
    switch (finding.kind) {
        case "identifier":
            return countText("identifierValue", finding.otherSites, [recipient.name]);
        case "screen":
            return finding.value.replace(/\s*[x*×]\s*/i, " × ");
        case "language":
            return languageName(finding.value);
        case "cookies":
            return countText("technicalCookies", finding.value);
        default:
            return String(finding.value);
    }
};