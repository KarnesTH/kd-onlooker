"use strict";

import {showView, field, setText} from "../dom.js";
import {text} from "../localizer.js";

/**
 * Fills the empty view for a page without third-party recipients; `onReload` reloads the tab.
 */
export const renderEmpty = (pageHost, onReload) => {
    const view = showView("empty");
    setText(view, "host", pageHost);
    setText(view, "text", text("emptyText", [pageHost]));
    field(view, "reload").onclick = onReload;
};