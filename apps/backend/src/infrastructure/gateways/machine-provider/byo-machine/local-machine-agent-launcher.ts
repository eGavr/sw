import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MachineAgentLauncher } from "./machine-agent-launcher";

// The machine-lease agent script, resolved relative to this file — the same path in dev (ts under src)
// and in the built image (js under build/src), where the Dockerfile copies the .sh next to it.
const agentScriptPath = join(
    __dirname,
    "../../../../presentation/http/internal/controllers/machine-leases/machine-agent.sh",
);

// Runs the agent as a detached child of the control plane on the same machine (the `local` cloud):
// its own session so it outlives the request and a returned host self-fences on 404. Output goes to a
// per-host temp log for debugging; the agent writes each slot's own log under its state dir.
export class LocalMachineAgentLauncher extends MachineAgentLauncher {
    launch(env: Record<string, string>): void {
        const logPath = join(tmpdir(), `sw-machine-agent-${env.SW_LEASE_ID}.log`);
        const log = openSync(logPath, "a");

        const child = spawn("bash", [agentScriptPath], {
            detached: true,
            stdio: ["ignore", log, log],
            env: { ...process.env, ...env },
        });

        child.unref();
    }
}
