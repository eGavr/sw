import type { Readable } from "stream";

export type RemoteArtifact = {
    readonly body: Readable;
    readonly contentType?: string;
};

// Driven port over a remote artifact host (the install's store, Chrome for Testing, …): fetches one
// artifact by URL as a stream. Null when the host says the artifact does not exist.
export abstract class RemoteArtifactGateway {
    abstract fetch(url: string): Promise<RemoteArtifact | null>;
}
