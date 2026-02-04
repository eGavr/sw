// FIXME: all middlewares are displayed as "middleware - <anonymous>"

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

(function (): void {
    if (process.env.OTEL_ENABLED !== "true") {
        return;
    }

    const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter(),
        instrumentations: [
            getNodeAutoInstrumentations(),
        ],
    });

    process.on("beforeExit", async () => sdk.shutdown());

    sdk.start();
})();
