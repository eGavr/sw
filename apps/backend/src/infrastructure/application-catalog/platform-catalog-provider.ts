import { PlatformCatalog } from "../../domain/entities/application-catalog/platform-catalog";

// The platform base-image lines this install provisions: install infrastructure (which images the
// install actually builds), so they live in code, not in a tenant's data — unlike applications, which
// are project resources. Versions are the USER-FACING OS versions (android 14, not API level 34) —
// the runtime/API-level mapping is an adapter's business (an android-14 AVD is built on the API-34
// image and is named sw-android-14).
export const PlatformCatalogProvider = {
    provide: PlatformCatalog,
    useFactory: (): PlatformCatalog => PlatformCatalog.fromObject({
        platforms: [
            { name: "ubuntu", versions: ["24.04"] },
            { name: "android", versions: ["13", "14"] },
        ],
    }),
};
