/**
 * Reads the values of the current page that third parties could receive.
 */
function readProfile() {
    return {
        url: location.href,
        title: document.title,
        screenWidth: screen.width,
        screenHeight: screen.height,
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent
    };
}

function sendProfile() {
    browser.runtime.sendMessage({ type: "pageProfile", profile: readProfile() }).catch(() => {});
}

sendProfile();
document.addEventListener("DOMContentLoaded", sendProfile, { once: true });
window.addEventListener("load", sendProfile, { once: true });