import { text } from "./localizer.js";

/**
 * Shows the section `[data-view=name]`, hides all other views, and returns the shown section.
 */
export function showView(name) {
    let shown = null;
    for (const view of document.querySelectorAll("[data-view]")) {
        view.hidden = view.dataset.view !== name;
        if (!view.hidden) shown = view;
    }
    return shown;
}

/**
 * Returns the element `[data-field=name]` inside `root`.
 */
export function field(root, name) {
    return root.querySelector(`[data-field="${name}"]`);
}

/**
 * Sets the text content of `[data-field=name]` inside `root`.
 */
export function setText(root, name, value) {
    field(root, name).textContent = value;
}

/**
 * Returns the element `[data-list=name]` inside `root`.
 */
export function list(root, name) {
    return root.querySelector(`[data-list="${name}"]`);
}

/**
 * Clones the first element of `<template id=id>` and fills its static texts.
 */
export function cloneTemplate(id) {
    const element = document.getElementById(id).content.firstElementChild.cloneNode(true);
    applyTexts(element);
    return element;
}

/**
 * Fills `[data-i18n]` with the message text and `[data-i18n-label]` with the message as aria-label.
 */
export function applyTexts(root) {
    for (const element of root.querySelectorAll("[data-i18n]")) element.textContent = text(element.dataset.i18n);
    for (const element of root.querySelectorAll("[data-i18n-label]")) element.setAttribute("aria-label", text(element.dataset.i18nLabel));
    if (root.dataset?.i18n) root.textContent = text(root.dataset.i18n);
}

/**
 * Replaces the `ti-<name>` class of a Tabler icon element.
 */
export function setIcon(element, name) {
    for (const className of [...element.classList]) {
        if (className.startsWith("ti-")) element.classList.remove(className);
    }
    element.classList.add(`ti-${name}`);
}

/**
 * Returns the uppercase first letter of a recipient name.
 */
export function initial(name) {
    return name.replace(/^www\./, "").charAt(0).toUpperCase();
}