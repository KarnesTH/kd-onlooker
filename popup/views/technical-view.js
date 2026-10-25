"use strict";

import {showView, field, setText, list, cloneTemplate} from "../dom.js";
import {text, countText, timeText, dateTimeText, lifetimeText} from "../localizer.js";

const openIndex = {requests: 0, cookieItems: 0};
const TAB_FIELDS = {requests: "tabRequests", cookieItems: "tabCookies"};

/**
 * Fills the technical view with the requests and cookies of a recipient; the requests tab and the
 * first item of each list start open.
 */
export const renderTechnical = (recipient, onBack) => {
    const view = showView("technical");
    setText(view, "backLabel", recipient.name);
    setText(view, "sub", `${recipient.name} · ${recipient.hosts.join(", ")}`);
    field(view, "back").onclick = onBack;

    const requests = list(view, "requests");
    requests.replaceChildren(...recipient.requests.map((request, index) => requestItem(request, index, requests)));
    const cookies = list(view, "cookieItems");
    cookies.replaceChildren(...(recipient.cookies.length > 0
        ? recipient.cookies.map((cookie, index) => cookieItem(cookie, index, cookies))
        : [cloneTemplate("tpl-cookies-empty")]));

    openIndex.requests = 0;
    openIndex.cookieItems = 0;
    applyOpenState(requests);
    applyOpenState(cookies);

    const tabRequests = field(view, "tabRequests");
    const tabCookies = field(view, "tabCookies");
    tabRequests.textContent = text("tabRequests", [recipient.requests.length]);
    tabCookies.textContent = text("tabCookies", [recipient.cookies.length]);
    tabRequests.onclick = () => selectTab(view, "requests");
    tabCookies.onclick = () => selectTab(view, "cookieItems");
    tabRequests.onkeydown = (event) => switchTabByKey(view, event, "cookieItems");
    tabCookies.onkeydown = (event) => switchTabByKey(view, event, "requests");
    selectTab(view, "requests");
};

/**
 * Shows the panel `name` ("requests" or "cookieItems"), marks its tab as selected, and makes only the
 * selected tab reachable with Tab.
 */
const selectTab = (view, name) => {
    for (const [panel, tabField] of Object.entries(TAB_FIELDS)) {
        const selected = panel === name;
        list(view, panel).hidden = !selected;
        field(view, tabField).setAttribute("aria-selected", String(selected));
        field(view, tabField).tabIndex = selected ? 0 : -1;
    }
};

/**
 * Selects and focuses the `other` tab on ArrowLeft or ArrowRight.
 */
const switchTabByKey = (view, event, other) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectTab(view, other);
    field(view, TAB_FIELDS[other]).focus();
};

const requestItem = (request, index, container) => {
    const item = cloneTemplate("tpl-request");
    setText(item, "method", request.method);
    setText(item, "path", request.path);
    setText(item, "time", timeText(request.timeStamp));
    setText(item, "url", request.url);

    const params = request.params.map((param) => kvRow("tpl-kv-row", param.key, param.value, param.hit));
    list(item, "params").replaceChildren(...(params.length > 0 ? params : [cloneTemplate("tpl-kv-empty")]));

    const headers = [];
    if (request.cookieCount > 0) headers.push(kvRow("tpl-kv-row", "Cookie", countText("technicalCookies", request.cookieCount), false));
    if (request.referer) headers.push(kvRow("tpl-kv-row", "Referer", request.referer, false));
    if (request.origin) headers.push(kvRow("tpl-kv-row", "Origin", request.origin, false));
    list(item, "headers").replaceChildren(...headers);
    field(item, "headersBlock").hidden = headers.length === 0;

    field(item, "toggle").onclick = () => toggle(container, index);
    return item;
};

const cookieItem = (cookie, index, container) => {
    const item = cloneTemplate("tpl-cookie-item");
    setText(item, "name", cookie.name);
    setText(item, "domain", cookie.domain.replace(/^\./, ""));
    setText(item, "value", cookie.value);

    list(item, "parts").replaceChildren(...cookie.parts.map((part) => {
        const row = cloneTemplate("tpl-kv-part");
        setText(row, "key", part.key);
        setText(row, "value", part.value);
        setText(row, "meaning", partMeaning(part));
        field(row, "meaning").hidden = part.kind === null;
        field(row, "value").classList.toggle("kv__value--hit", part.kind === "identifier");
        return row;
    }));

    const expires = cookie.session || !cookie.expirationDate
        ? text("cookieSession")
        : `${dateTimeText(cookie.expirationDate * 1000)} · ${lifetimeText(cookie.expirationDate)}`;
    list(item, "props").replaceChildren(
        kvRow("tpl-kv-prop", text("propDomain"), cookie.domain, false),
        kvRow("tpl-kv-prop", text("propPath"), cookie.path, false),
        kvRow("tpl-kv-prop", text("propExpires"), expires, false),
        kvRow("tpl-kv-prop", text("propSecure"), yesNo(cookie.secure), false),
        kvRow("tpl-kv-prop", text("propHttpOnly"), yesNo(cookie.httpOnly), false),
        kvRow("tpl-kv-prop", text("propSameSite"), cookie.sameSite, false),
        kvRow("tpl-kv-prop", text("propPartitioned"), cookie.partitionSite ? text("partitionedFor", [cookie.partitionSite]) : text("valueNo"), false)
    );

    field(item, "toggle").onclick = () => toggle(container, index);
    return item;
};

const partMeaning = (part) => {
    if (part.kind === "identifier") return text("partIdentifier");
    if (part.kind === "timestamp") return text("partTimestamp", [dateTimeText(part.time)]);
    if (part.kind === "text") return text("partText", [part.decoded]);
    return "";
};

const yesNo = (value) => {
    return text(value ? "valueYes" : "valueNo");
};

const kvRow = (template, key, value, hit) => {
    const row = cloneTemplate(template);
    setText(row, "key", key);
    setText(row, "value", value);
    field(row, "value").classList.toggle("kv__value--hit", hit);
    return row;
};

const toggle = (container, index) => {
    const name = container.dataset.list;
    openIndex[name] = openIndex[name] === index ? -1 : index;
    applyOpenState(container);
};

/**
 * Expands the item at the container's open index and collapses all others.
 */
const applyOpenState = (container) => {
    const index = openIndex[container.dataset.list];
    [...container.children].forEach((item, position) => {
        const body = field(item, "body");
        if (!body) return;
        const open = position === index;
        item.classList.toggle("request--open", open);
        body.hidden = !open;
        field(item, "toggle").setAttribute("aria-expanded", String(open));
    });
};