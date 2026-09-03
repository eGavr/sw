import { CloudReachability } from "../../../../application/interfaces/gateways/environment-provider-gateway";

export type VmInstanceOptions = {
    name: string;
    // The cloud folder to create the VM in. Omitted uses the client's construction-time default (the
    // operator's own folder); set per cloud account to provision into the user's delegated folder.
    folderId?: string;
    imageId: string;
    // The hardware platform to schedule on; used to select a KVM-capable platform for the Android emulator
    // (which needs /dev/kvm). Omitted for the browser/redroid path, which takes the cloud default.
    platformId?: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    metadata: Record<string, string>;
};

// A driven sub-port over a VM cloud: create/delete an on-demand VM. Used by the VM-based environment
// adapters (redroid, emulator) so they depend on this abstraction rather than a concrete cloud client —
// so the same adapter can run on a different VM cloud by swapping the implementation (no per-cloud adapter
// duplication). One implementation today (YandexComputeClient); a second cloud adds a second implementation
// behind this port.
//
// NOTE: the options are still Yandex-shaped (zone/subnetId/imageId). Generalising them across clouds — and
// feeding them from the cloud account rather than install config — is a follow-up for when a second VM
// cloud is actually added.
export abstract class VmProvisioner {
    abstract createInstance(options: VmInstanceOptions): Promise<void>;

    // folderId scopes the delete to the folder the VM was created in (the user's, per cloud account);
    // omitted uses the client's default folder.
    abstract deleteInstance(name: string, folderId?: string): Promise<void>;

    // Read-only reachability probe: can we operate this VM cloud under our identity (for a delegated cloud,
    // has the user granted us access to their folder)? folderId probes that specific folder; omitted checks
    // general reachability under our identity. Feeds the "cloud available" badge.
    abstract checkAccess(folderId?: string): Promise<CloudReachability>;

    // The labels on the folder — read-only (resource-manager.viewer). Used to check the per-project
    // ownership marker the folder's owner placed; we can read labels but not write them, which is what
    // makes the marker unforgeable through our identity.
    abstract folderLabels(folderId: string): Promise<Record<string, string>>;
}
