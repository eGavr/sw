import { Readable } from "stream";

import { Injectable } from "@nestjs/common";

import {
    RemoteArtifact,
    RemoteArtifactGateway,
} from "../../../application/interfaces/gateways/remote-artifact-gateway";
import { InternalError } from "../../../domain/entities/error/internal-error";

// How long we wait for the remote host to START answering; the body itself may stream for as long as
// the artifact is big.
export const headersTimeoutMs = 30_000;

@Injectable()
export class HttpRemoteArtifactGateway extends RemoteArtifactGateway {
    async fetch(url: string): Promise<RemoteArtifact | null> {
        // The deadline covers the wait for headers only, so it is cancelled the moment they arrive:
        // an AbortSignal.timeout would keep ticking over the BODY and cut a big artifact mid-download.
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(), headersTimeoutMs);
        let response: Response;

        try {
            response = await fetch(url, { signal: deadline.signal });
        } finally {
            clearTimeout(timer);
        }

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
