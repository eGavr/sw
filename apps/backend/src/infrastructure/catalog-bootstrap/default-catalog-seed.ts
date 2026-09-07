import {
    CatalogSeedApplication,
} from "../../application/use-cases/catalog/ensure-catalog-project-use-case";

// What a fresh install's catalog project starts with; from here on the catalog lives in the database
// and install admins manage it through the ordinary application API (the baking pipeline included).
//
// Every application is ONE word — `chrome`, `settings` — the same shape a user's custom has. Nobody
// declares an identity: an android package id (`com.android.settings`) is detected on the device and
// lands beside the word; a linux app has nothing detectable (deb says google-chrome-stable, flatpak
// com.google.Chrome — all conventions), so its word is all there is.
//
// Chrome for Testing publishes chrome and its EXACTLY matching chromedriver as a pair per full
// version — that pairing is the point of the paired refs. Android has no public chrome artifact; its
// entries appear once the install bakes its own store, so today an android environment installs
// registered customs or targets the preinstalled system apps.
const chromeForTestingVersion = "152.0.7977.82";
const chromeForTestingBase = `https://storage.googleapis.com/chrome-for-testing-public/${chromeForTestingVersion}`;

export const defaultCatalogSeed: ReadonlyArray<CatalogSeedApplication> = [
    {
        platformName: "ubuntu",
        nameAlias: "chrome",
        versions: [{
            versionAlias: "152",
            appRef: `${chromeForTestingBase}/linux64/chrome-linux64.zip`,
            webdriverRef: `${chromeForTestingBase}/linux64/chromedriver-linux64.zip`,
        }],
    },
    // Preinstalled on every android image (no artifacts to deliver) — resolvable as an environment's
    // application so a session can target it; one build label per android line.
    {
        platformName: "android",
        nameAlias: "settings",
        versions: [{ versionAlias: "13" }, { versionAlias: "14" }],
    },
];
