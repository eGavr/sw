import { ApplicationCatalogData } from "../../domain/entities/application-catalog/application-catalog";

// The built-in delivery offer of a dev/local install; a real install overrides the whole catalog with
// APPLICATION_CATALOG_FILE (a JSON of the same shape) once its own artifact store is baked (the
// catalog "варка" keeps these pinned versions fresh — a separate task).
//
// Chrome for Testing publishes chrome and its EXACTLY matching chromedriver as a pair per full
// version — that pairing is the whole point of the paired refs here. Android has no such public
// chrome artifact; its catalog gains entries when we bake our own store, so today an android
// environment installs custom (user-artifact) apps or targets preinstalled system ones.
const chromeForTestingVersion = "152.0.7977.82";
const chromeForTestingBase = `https://storage.googleapis.com/chrome-for-testing-public/${chromeForTestingVersion}`;

export const defaultApplicationCatalog: ApplicationCatalogData = {
    platforms: [
        { name: "ubuntu", versions: ["24.04"] },
        // The android lines our images actually exist for: 13/14 (redroid container tags) and API-34
        // AVDs on pool hosts.
        { name: "android", versions: ["13", "14", "34"] },
    ],
    applications: [
        {
            platform: "ubuntu",
            name: "com.google.chrome",
            aliases: ["chrome"],
            version: chromeForTestingVersion,
            artifacts: {
                app: `${chromeForTestingBase}/linux64/chrome-linux64.zip`,
                webdriver: `${chromeForTestingBase}/linux64/chromedriver-linux64.zip`,
            },
        },
        // Preinstalled on every android image — resolvable as an environment's application (a session
        // can target it), nothing to deliver.
        { platform: "android", name: "com.android.settings", aliases: ["settings"], version: "13" },
        { platform: "android", name: "com.android.settings", aliases: ["settings"], version: "14" },
        { platform: "android", name: "com.android.settings", aliases: ["settings"], version: "34" },
    ],
};
