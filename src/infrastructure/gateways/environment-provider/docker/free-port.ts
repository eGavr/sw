import { createServer } from "net";

// Reserve an ephemeral host port by letting the OS assign one on a throwaway listener, then
// releasing it. There is a tiny window before `docker run` claims the port; acceptable at our
// load — a lost race just fails the provision and the reaper retries the environment.
export function reserveFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once("error", reject);
        server.listen(0, () => {
            const address = server.address();

            if (address === null || typeof address === "string") {
                server.close(() => reject(new Error("failed to reserve a free host port")));

                return;
            }

            const { port } = address;
            server.close(() => resolve(port));
        });
    });
}
