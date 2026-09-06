import {
    CatalogSeedApplication,
} from "../../application/use-cases/catalog/ensure-catalog-project-use-case";

// What a fresh install's catalog project starts with; from here on the catalog lives in the database
// and install admins manage it through the ordinary application API (the baking pipeline included).
//
// Chrome for Testing publishes chrome and its EXACTLY matching chromedriver as a pair per full
// version — that pairing is the point of the paired refs. Android has no public chrome artifact; its
// entries appear once the install bakes its own store, so today an android environment installs
// registered customs or targets the preinstalled system apps.
const chromeForTestingVersion = "152.0.7977.82";
const chromeForTestingBase = `https://storage.googleapis.com/chrome-for-testing-public/${chromeForTestingVersion}`;

export const defaultCatalogSeed: ReadonlyArray<CatalogSeedApplication> = [
    // A linux app has no native measurable id (deb says google-chrome-stable, flatpak
    // com.google.Chrome — all conventions), so by the "declared = alias" rule its name IS the word.
    // Reverse-DNS names exist only where a platform measures them (android package ids).
    {
        platformName: "ubuntu",
        name: "chrome",
        aliases: [],
        versions: [{
            version: chromeForTestingVersion,
            appRef: `${chromeForTestingBase}/linux64/chrome-linux64.zip`,
            webdriverRef: `${chromeForTestingBase}/linux64/chromedriver-linux64.zip`,
        }],
    },
    // Preinstalled on every android image (no artifacts to deliver) — resolvable as an environment's
    // application so a session can target it; versioned per android line.
    {
        platformName: "android",
        name: "com.android.settings",
        aliases: ["settings"],
        versions: [{ version: "13" }, { version: "14" }, { version: "34" }],
    },
];
