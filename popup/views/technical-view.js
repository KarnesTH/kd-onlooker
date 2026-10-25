import { showView, field, setText, list, cloneTemplate, setIcon } from "../dom.js";
import { countText, listText, timeText } from "../localizer.js";

let openIndex = 0;

/**
 * Fills the technical view with the requests of a recipient; the first request starts expanded.
 */
export function renderTechnical(recipient, onBack) {
    const view = showView("technical");
    setText(view, "backLabel", recipient.name);
    setText(view, "sub", countText("technicalSubtitle", recipient.requests.length, [listText(recipient.hosts)]));
    field(view, "back").onclick = onBack;

    const container = list(view, "requests");
    container.replaceChildren(...recipient.requests.map((request, index) => requestItem(request, index, container)));
    openIndex = 0;
    applyOpenState(container);
}

function requestItem(request, index, container) {
    const item = cloneTemplate("tpl-request");
    setText(item, "method", request.method);
    setText(item, "path", request.path);
    setText(item, "time", timeText(request.timeStamp));
    setText(item, "url", request.url);

    const params = request.params.map((param) => kvRow(param.key, param.value, param.hit));
    list(item, "params").replaceChildren(...(params.length > 0 ? params : [cloneTemplate("tpl-kv-empty")]));

    const headers = [];
    if (request.cookieCount > 0) headers.push(kvRow("Cookie", countText("technicalCookies", request.cookieCount), false));
    if (request.referer) headers.push(kvRow("Referer", request.referer, false));
    if (request.origin) headers.push(kvRow("Origin", request.origin, false));
    list(item, "headers").replaceChildren(...headers);
    field(item, "headersBlock").hidden = headers.length === 0;

    field(item, "toggle").onclick = () => {
        openIndex = openIndex === index ? -1 : index;
        applyOpenState(container);
    };
    return item;
}

function kvRow(key, value, hit) {
    const row = cloneTemplate("tpl-kv-row");
    setText(row, "key", key);
    setText(row, "value", value);
    field(row, "value").classList.toggle("kv__value--hit", hit);
    return row;
}

/**
 * Expands the request at `openIndex` and collapses all others.
 */
function applyOpenState(container) {
    [...container.children].forEach((item, index) => {
        const open = index === openIndex;
        item.classList.toggle("request--open", open);
        field(item, "body").hidden = !open;
        field(item, "toggle").setAttribute("aria-expanded", String(open));
        setIcon(field(item, "chevron"), open ? "chevron-down" : "chevron-right");
    });
}