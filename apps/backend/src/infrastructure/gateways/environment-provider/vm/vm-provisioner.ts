import { CloudReachability } from "../../../../application/interfaces/gateways/environment-provider-gateway";

export type VmInstanceOptions = {
    name: string;
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

    abstract deleteInstance(name: string): Promise<void>;

    // Read-only reachability probe: can we operate this VM cloud under our identity (for a delegated cloud,
    // has the user granted us access to their folder)? Feeds the "cloud available" badge.
    abstract checkAccess(): Promise<CloudReachability>;
}
