import { Readable } from "stream";

import { Injectable } from "@nestjs/common";

import {
    RemoteArtifact,
    RemoteArtifactGateway,
} from "../../../application/interfaces/gateways/remote-artifact-gateway";
import { InternalError } from "../../../domain/entities/error/internal-error";

// How long we wait for the remote host to START answering; the body itself may stream for as long as
// the artifact is big.
const headersTimeoutMs = 30_000;

@Injectable()
export class HttpRemoteArtifactGateway extends RemoteArtifactGateway {
    async fetch(url: string): Promise<RemoteArtifact | null> {
        const response = await fetch(url, { signal: AbortSignal.timeout(headersTimeoutMs) });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok || response.body === null) {
            throw new InternalError(`artifact fetch: ${url}: HTTP ${response.status}`);
        }

        return {
            body: Readable.fromWeb(response.body as never),
            contentType: response.headers.get("content-type") ?? undefined,
        };
    }
}
