import { PlatformCatalog } from "../../domain/entities/application-catalog/platform-catalog";

// The platform base-image lines this install provisions: install infrastructure (which images the
// install actually builds), so they live in code, not in a tenant's data — unlike applications, which
// are project resources. Versions are the USER-FACING OS versions (android 14, not API level 34) —
// the runtime/API-level mapping is an adapter's business (an android-14 AVD is built on the API-34
// image and is named sw-android-14). Device kinds are the hardware profiles a virtual environment can
// wear: an android id names an emulator device definition (`pixel-7` -> `pixel_7`, Google's list), the
// desktop line has the one kind there is.
export const PlatformCatalogProvider = {
    provide: PlatformCatalog,
    useFactory: (): PlatformCatalog => PlatformCatalog.fromObject({
        platforms: [
            { name: "ubuntu", versions: ["24.04"], devices: [{ id: "desktop", displayName: "Desktop" }] },
            {
                name: "android",
                versions: ["13", "14"],
                devices: [
                    { id: "pixel-7", displayName: "Pixel 7" },
                    { id: "pixel-3a", displayName: "Pixel 3a" },
                ],
            },
        ],
    }),
};
