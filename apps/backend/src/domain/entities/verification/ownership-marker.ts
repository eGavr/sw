import { InvalidArgumentError } from "../error/invalid-argument-error";

// Proof that the owner of an external delegated resource (a cloud folder, a managed cluster, a bucket)
// authorises a SPECIFIC sw project to use it. The owner writes a per-project marker into the resource —
// somewhere only they can write and our identity can read — and we gate use of the resource on its
// presence. Keying the marker by project id is what makes naming someone else's resource useless: their
// project would need ITS OWN marker there, which only that resource's owner could place.
//
// The marker is a single medium-agnostic value: each cloud adapter decides HOW to look for it (a folder
// label key, a cluster label key, a bucket object key). The value is a valid YC label key and a valid
// object key, so the same string serves every medium; the domain stays free of any cloud/medium detail.
export class OwnershipMarker {
    static forProject(projectId: string): OwnershipMarker {
        if (!projectId || projectId.trim().length === 0) {
            throw new InvalidArgumentError("ownership marker: projectId is required");
        }

        return new OwnershipMarker(projectId);
    }

    private constructor(private readonly projectId: string) {}

    // The marker's identifying value for this project. Presence proves control; the stored value (if any)
    // is irrelevant to security. A YC label key must start with a letter and be `[-_0-9a-z]` (≤63) — a
    // uuid project id fits — and it is a valid object key too.
    value(): string {
        return `sw-verify-${this.projectId}`;
    }
}
