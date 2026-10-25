"use strict";

import {showView, field, setText, list, cloneTemplate, setIcon, initial} from "../dom.js";
import {text, countText} from "../localizer.js";
import {visibleFindings, isWarning, findingIcon, chipKey} from "../finding-kinds.js";

/**
 * Fills the overview with the report; `onSelect(key)` is called when a recipient card is clicked.
 */
export const renderOverview = (report, onSelect) => {
    const view = showView("overview");
    const total = report.recipients.length;
    const informed = report.recipients.filter((recipient) => visibleFindings(recipient.findings).length > 0);
    const others = report.recipients.filter((recipient) => visibleFindings(recipient.findings).length === 0);

    setText(view, "host", report.pageHost);
    setText(view, "count", countText("overviewCompanies", total));
    setText(view, "headline", countText("overviewHeadlineRest", total));

    const faces = report.recipients.slice(0, 3).map((recipient) => face(initial(recipient.name)));
    if (total > 3) faces.push(face(`+${total - 3}`));
    list(view, "faces").replaceChildren(...faces);

    field(view, "recognising").hidden = report.recognisingCount === 0;
    setText(view, "recognisingText", countText("overviewRecognising", report.recognisingCount));

    field(view, "sectionTitle").hidden = informed.length === 0;
    list(view, "informed").replaceChildren(...informed.map((recipient) => informedCard(recipient, onSelect)));

    const toggle = field(view, "othersToggle");
    const othersList = list(view, "others");
    toggle.hidden = others.length === 0;
    toggle.setAttribute("aria-expanded", "false");
    othersList.hidden = true;
    setText(view, "othersTitle", countText("overviewOthers", others.length));
    othersList.replaceChildren(...others.map(staticCard));
    toggle.onclick = () => {
        othersList.hidden = !othersList.hidden;
        toggle.setAttribute("aria-expanded", String(!othersList.hidden));
    };
};

const face = (label) => {
    const element = cloneTemplate("tpl-face");
    element.textContent = label;
    return element;
};

const informedCard = (recipient, onSelect) => {
    const findings = visibleFindings(recipient.findings);
    const card = cloneTemplate("tpl-card");
    setText(card, "initial", initial(recipient.name));
    setText(card, "name", recipient.name);
    setText(card, "sub", countText("recipientLearns", findings.length));
    list(card, "chips").replaceChildren(...findings.map(chip));
    card.addEventListener("click", () => onSelect(recipient.key));
    return card;
};

const staticCard = (recipient) => {
    const card = cloneTemplate("tpl-card-static");
    setText(card, "initial", initial(recipient.name));
    setText(card, "name", recipient.name);
    setText(card, "sub", recipient.hosts.join(", "));
    return card;
};

const chip = (finding) => {
    const warn = isWarning(finding.kind);
    const element = cloneTemplate(warn ? "tpl-chip-warn" : "tpl-chip");
    if (warn) setIcon(field(element, "icon"), findingIcon(finding.kind));
    setText(element, "label", text(chipKey(finding.kind)));
    return element;
};