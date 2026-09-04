import { HostProviderConfig } from "../../../../application/interfaces/gateways/host-provider-gateway";

// Install-level shape of the machines this provider leases: which BareMetal configuration, where, and
// the internal callback URL baked into every machine's boot metadata.
export type YandexBaremetalShape = {
    configurationId: string;
    zone: string;
    subnetId?: string;
    internalUrl: string;
};

// The binding's opaque config, read the yandex-baremetal way: the folder is the BYOC delegation
// target — machines are leased in the USER's folder, on their bill.
export function baremetalBindingConfig(config: HostProviderConfig | undefined): { folderId?: string } {
    const folderId = config?.["folderId"];

    return typeof folderId === "string" && folderId.length > 0 ? { folderId } : {};
}
