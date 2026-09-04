// Starts the pool-host agent on the machine the control plane itself runs on. This is what makes the
// `local` cloud a zero-ceremony dev experience: the CP spawns the agent for you (just like the docker
// adapter drives the local docker daemon), so connecting `local` + creating an emulator environment
// "just works" — no operator copying credentials into a terminal. A remote BYO host has no launcher
// and falls back to printing the credentials for a human.
export abstract class HostAgentLauncher {
    // Launch the agent for one pooled host with its per-host credentials already in the environment.
    abstract launch(env: Record<string, string>): void;
}
