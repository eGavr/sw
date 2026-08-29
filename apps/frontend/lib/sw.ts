// Client-side sw access: every call goes through the same-origin BFF proxy (/api/sw/*), which adds the
// Bearer token on the server. The browser never holds a token.

export interface Project {
  name: string; // "projects/{handle}" — handle is the human id when set, else the uid
  uid: string;
  displayName: string;
  createTime: string;
  updateTime: string;
}

export interface Environment {
  name: string; // "projects/{project}/environments/{handle}"
  uid: string;
  state: string; // ENQUEUED | PREPARING | ACTIVE | UNHEALTHY | DELETING | DELETED | FAILED
  stateReason?: string;
  platform: { name: string; version: string; deviceModel?: string };
  execution: string;
  applications: Array<{ name: string; version: string }>;
  busy: boolean; // occupancy, orthogonal to state: the agent's last heartbeat word
  lastHeartbeatTime?: string;
  // Caller-dependent capabilities (the Drive files.capabilities pattern); omitted when empty.
  capabilities?: { canAccessCurrentSession?: boolean };
  createTime: string;
}

export interface CreateEnvironmentInput {
  platform: { name: string; version: string; deviceModel?: string };
  applications: Array<{ name: string; version: string }>;
  execution: string;
  environmentId?: string;
}

// A (platform, execution) pair a cloud can provision — the same wire shape in the cloud-types
// catalogue and in a connected cloud account's `provides`.
export interface Substrate {
  platform: string;
  execution: string;
}

export interface CloudType {
  name: string; // "cloudTypes/{type}"
  type: string;
  provides: Array<Substrate>;
}

export interface CloudAccount {
  name: string; // "projects/{project}/cloudAccounts/{uid}"
  uid: string;
  type: string;
  config: Record<string, unknown>;
  provides: Array<Substrate>;
  createTime: string;
  updateTime: string;
}

// The URL handle a resource is addressed by (nested resources live under it).
export function projectHandle(project: Project): string {
  return project.name.replace(/^projects\//, "");
}

export function environmentHandle(environment: Environment): string {
  return environment.name.replace(/^projects\/[^/]+\/environments\//, "");
}

// A 401 from the BFF means the session cookie went stale beyond refresh — re-authenticate instead of
// leaving queries to retry into an eternal spinner.
function bounceToLogin(): never {
  window.location.assign("/login");
  throw new Error("session expired — redirecting to sign-in");
}

async function swRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/sw/${path}`, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });

  if (res.status === 401) {
    bounceToLogin();
  }

  if (!res.ok) {
    let message = `sw ${path} → ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string }; message?: string };
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    throw new Error(message);
  }

  const text = await res.text();

  return (text ? JSON.parse(text) : undefined) as T;
}

export function listProjects(): Promise<Array<Project>> {
  return swRequest<{ projects?: Array<Project> }>("v1/projects").then((d) => d.projects ?? []);
}

export function createProject(input: { displayName: string; projectId?: string }): Promise<Project> {
  return swRequest<Project>("v1/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function listEnvironments(project: string): Promise<Array<Environment>> {
  return swRequest<{ environments?: Array<Environment> }>(
    `v1/projects/${project}/environments`,
  ).then((d) => d.environments ?? []);
}

export function createEnvironment(project: string, input: CreateEnvironmentInput): Promise<Environment> {
  return swRequest<Environment>(`v1/projects/${project}/environments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteEnvironment(project: string, environment: string): Promise<void> {
  return swRequest<void>(`v1/projects/${project}/environments/${environment}`, { method: "DELETE" });
}

export interface CreateSessionInput {
  environmentId: string;
  application: { name: string; version: string };
  logging: boolean;
  video: boolean;
}

// The one-time session result: the id is a capability secret shown once and stored nowhere;
// `interactive` is the ready-to-open hosted viewer page the wd host advertises.
export interface CreatedSession {
  sessionId: string;
  interactive?: string;
}

// W3C New Session through the wd BFF proxy: the requested application rides as browserName/Version,
// our opt-ins as vendor sw:* capabilities, and sw:environmentId pins the session to the chosen row.
export async function createSession(project: string, input: CreateSessionInput): Promise<CreatedSession> {
  const res = await fetch("/api/wd/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: input.application.name,
          browserVersion: input.application.version,
          "sw:projectId": project,
          "sw:environmentId": input.environmentId,
          "sw:logging": input.logging,
          "sw:video": input.video,
        },
      },
    }),
  });

  if (res.status === 401) {
    bounceToLogin();
  }

  const body = (await res.json().catch(() => ({}))) as {
    value?: { sessionId?: string; capabilities?: Record<string, unknown> };
    message?: string;
  };

  if (!res.ok || !body.value?.sessionId) {
    throw new Error(body.message ?? `wd sessions → ${res.status}`);
  }

  const interactive = body.value.capabilities?.["sw:interactive"];

  return {
    sessionId: body.value.sessionId,
    interactive: typeof interactive === "string" ? interactive : undefined,
  };
}

// The live capability id of the environment's current session — served only to the session's creator
// (404 to everyone else, including "no session at all": existence is not revealed).
export function getEnvironmentSession(project: string, environment: string): Promise<{ sessionId: string }> {
  return swRequest<{ sessionId: string }>(
    `v1/projects/${project}/environments/${environment}/session`,
  );
}

// Session teardown is authorized by possession of the id (capability) — the proxy ride is only for
// same-origin convenience.
export async function killSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/wd/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });

  if (res.status === 401) {
    bounceToLogin();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `wd sessions → ${res.status}`);
  }
}

export function listCloudTypes(): Promise<Array<CloudType>> {
  return swRequest<{ cloudTypes?: Array<CloudType> }>("v1/cloudTypes").then((d) => d.cloudTypes ?? []);
}

export function listCloudAccounts(project: string): Promise<Array<CloudAccount>> {
  return swRequest<{ cloudAccounts?: Array<CloudAccount> }>(
    `v1/projects/${project}/cloudAccounts`,
  ).then((d) => d.cloudAccounts ?? []);
}

export function connectCloud(project: string, type: string): Promise<CloudAccount> {
  return swRequest<CloudAccount>(`v1/projects/${project}/cloudAccounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

// A real delete; the API refuses with 409 while environments still reference the account.
export function disconnectCloud(project: string, cloudAccount: string): Promise<void> {
  return swRequest<void>(`v1/projects/${project}/cloudAccounts/${cloudAccount}`, {
    method: "DELETE",
  });
}
