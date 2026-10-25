"use strict";

/**
 * Reads the values of the current page that third parties could receive.
 */
const readProfile = () => {
    return {
        title: document.title,
        screenWidth: screen.width,
        screenHeight: screen.height,
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
};

(() => {
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "getProfile") return Promise.resolve(readProfile());
        return undefined;
    });
})();