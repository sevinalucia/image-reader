/*
  theme.js - pre-paint theme resolution for the reader page

  The dark skins gate on html[theme], but the attribute was only set
  from config.load: every dark open flashed light first. Inline scripts
  violate the extension CSP, so the resolution lives in this external
  file, loaded before the stylesheets. The OS preference resolves
  synchronously (the first paint cannot wait for an async read, so
  auto/unset rides the media query), then the stored override lands one
  tick later - only an explicit stored theme that differs from the OS
  preference can still flash. config.load remains the canonical sync
  and runs right after.
*/

(function () {
  if (!window.chrome || !chrome.storage || !chrome.storage.local) return;
  /*  */
  const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("theme", system);
  chrome.storage.local.get(["theme", "uimode"], function (e) {
    const stored = e.theme;
    const resolved = stored !== undefined && stored !== "auto" ? stored : system;
    /* the Material/classic skin rides the same attribute mechanism -
       resolving both here keeps the first paint from flashing classic
       before config.load finishes the async round-trip */
    document.documentElement.setAttribute("theme", resolved);
    if (e.uimode === "modern" || e.uimode === "classic") {
      document.documentElement.setAttribute("uimode", e.uimode);
    }
  });
})();
