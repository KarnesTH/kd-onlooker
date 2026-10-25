import { showView, field } from "../dom.js";

/**
 * Shows the unavailable view; `reason` is "internal" for pages extensions cannot access,
 * "permission" for a revoked host permission.
 */
export function renderUnavailable(reason) {
    const view = showView("unavailable");
    field(view, "internal").hidden = reason !== "internal";
    field(view, "permission").hidden = reason !== "permission";
}