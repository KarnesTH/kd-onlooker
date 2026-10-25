import { showView, field, setText, list, cloneTemplate, setIcon, initial } from "../dom.js";
import { text, countText, languageName } from "../localizer.js";
import { visibleFindings, isWarning, findingIcon, titleKey } from "../finding-kinds.js";

/**
 * Fills the recipient view; `onBack` returns to the overview, `onTechnical` opens the technical view.
 */
export function renderRecipient(recipient, onBack, onTechnical) {
    const view = showView("recipient");
    const findings = visibleFindings(recipient.findings);

    setText(view, "initial", initial(recipient.name));
    setText(view, "name", recipient.name);
    setText(view, "learned", countText("recipientLearned", findings.length));
    list(view, "facts").replaceChildren(...findings.map((finding) => fact(finding, recipient)));

    field(view, "notice").hidden = !findings.some((finding) => finding.kind === "identifier");
    setText(view, "noticeText", text("identifierInfo", [recipient.name]));
    setText(view, "technicalText", countText("technicalLink", recipient.requests.length));

    field(view, "back").onclick = onBack;
    field(view, "technical").onclick = onTechnical;
}

function fact(finding, recipient) {
    const row = cloneTemplate(isWarning(finding.kind) ? "tpl-fact-warn" : "tpl-fact");
    setIcon(field(row, "icon"), findingIcon(finding.kind));
    setText(row, "title", text(titleKey(finding.kind)));
    setText(row, "value", factValue(finding, recipient));
    return row;
}

/**
 * Formats matched the value of a finding for display.
 */
function factValue(finding, recipient) {
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
}