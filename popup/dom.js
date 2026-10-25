"use strict";

import {text} from "./localizer.js";

const ICON_PATH = "../assets/icons/";

/**
 * Shows the section `[data-view=name]`, hides all other views, and returns the shown section.
 */
export const showView = (name) => {
    let shown = null;
    for (const view of document.querySelectorAll("[data-view]")) {
        view.hidden = view.dataset.view !== name;
        if (!view.hidden) shown = view;
    }
    return shown;
};

/**
 * Returns the first element `[data-field=name]` inside `root` that is not part of a `[data-list]`
 * nested in `root`.
 */
export const field = (root, name) => {
    for (const element of root.querySelectorAll(`[data-field="${name}"]`)) {
        const owner = element.closest("[data-list]");
        if (!owner || !root.contains(owner)) return element;
    }
    return null;
};

/**
 * Sets the text content of `[data-field=name]` inside `root`.
 */
export const setText = (root, name, value) => {
    field(root, name).textContent = value;
};

/**
 * Returns the element `[data-list=name]` inside `root`.
 */
export const list = (root, name) => {
    return root.querySelector(`[data-list="${name}"]`);
};

/**
 * Clones the first element of `<template id=id>` and fills its static texts.
 */
export const cloneTemplate = (id) => {
    const element = document.getElementById(id).content.firstElementChild.cloneNode(true);
    applyTexts(element);
    return element;
};

/**
 * Fills `[data-i18n]` with the message text and `[data-i18n-label]` with the message as aria-label.
 */
export const applyTexts = (root) => {
    for (const element of root.querySelectorAll("[data-i18n]")) element.textContent = text(element.dataset.i18n);
    for (const element of root.querySelectorAll("[data-i18n-label]")) element.setAttribute("aria-label", text(element.dataset.i18nLabel));
    if (root.dataset?.i18n) root.textContent = text(root.dataset.i18n);
};

/**
 * Points the `<use>` of an SVG icon element to `assets/icons/<name>.svg#icon`.
 */
export const setIcon = (element, name) => {
    element.querySelector("use").setAttribute("href", `${ICON_PATH}${name}.svg#icon`);
};

/**
 * Returns the uppercase first letter of a recipient name.
 */
export const initial = (name) => {
    return name.replace(/^www\./, "").charAt(0).toUpperCase();
};