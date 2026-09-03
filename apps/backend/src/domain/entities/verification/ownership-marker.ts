import { InvalidArgumentError } from "../error/invalid-argument-error";

// Proof that the owner of an external delegated resource (a cloud folder, a managed cluster, a bucket)
// authorises a SPECIFIC sw project to use it. The owner writes a per-project marker into the resource —
// somewhere only they can write and our identity can read — and we gate use of the resource on its
// presence. Keying the marker by project id is what makes naming someone else's resource useless: their
// project would need ITS OWN marker there, which only that resource's owner could place.
export class OwnershipMarker {
    static forProject(projectId: string): OwnershipMarker {
        if (!projectId || projectId.trim().length === 0) {
            throw new InvalidArgumentError("ownership marker: projectId is required");
        }

        return new OwnershipMarker(projectId);
    }

    private constructor(private readonly projectId: string) {}

    // A cloud/cluster resource label key (YC label: starts with a letter, `[-_0-9a-z]`, ≤63 chars — a
    // uuid project id fits). Its PRESENCE proves control; the value is irrelevant to security.
    labelKey(): string {
        return `sw-verify-${this.projectId}`;
    }

    // A bucket object key (marker placed at bucket root, independent of the artifact prefix).
    objectKey(): string {
        return `sw-verify/${this.projectId}`;
    }

    // Whether the resource's labels carry this project's marker.
    presentIn(labels: Readonly<Record<string, string>>): boolean {
        return Object.prototype.hasOwnProperty.call(labels, this.labelKey());
    }
}
