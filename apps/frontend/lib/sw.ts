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
  // Orthogonal to state: FREE | RESERVED (a session create is in flight) | BUSY (a session runs).
  occupancy: "FREE" | "RESERVED" | "BUSY";
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

// The created session's capability id — everything else (viewer, logs, video) hangs off it via Inspect.
export interface CreatedSession {
  sessionId: string;
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
    value?: { sessionId?: string };
    message?: string;
  };

  if (!res.ok || !body.value?.sessionId) {
    throw new Error(body.message ?? `wd sessions → ${res.status}`);
  }

  return { sessionId: body.value.sessionId };
}

// The live capability id of the environment's current session — served only to the session's creator
// (404 to everyone else, including "no session at all": existence is not revealed).
export function getEnvironmentSession(project: string, environment: string): Promise<{ sessionId: string }> {
  return swRequest<{ sessionId: string }>(
    `v1/projects/${project}/environments/${environment}/session`,
  );
}

// The session's captured log, or null while it does not exist yet (logs ship when the session ends,
// and only when sw:logging was on) — the caller renders a placeholder, not an error.
export async function getSessionLogs(project: string, sessionId: string): Promise<string | null> {
  const res = await fetch(
    `/api/sw/v1/projects/${project}/sessions/${encodeURIComponent(sessionId)}/logs`,
    { headers: { accept: "application/json" } },
  );

  if (res.status === 401) {
    bounceToLogin();
  }

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`session logs → ${res.status}`);
  }

  const body = (await res.json()) as { content?: string };

  return body.content ?? "";
}

// The same-origin (BFF-proxied) video URL a <video> tag can play directly — the browser sends the
// session cookie, the proxy adds the bearer and streams the bytes through.
export function sessionVideoUrl(project: string, sessionId: string): string {
  return `/api/sw/v1/projects/${project}/sessions/${encodeURIComponent(sessionId)}/video`;
}

// The wd host's hosted noVNC viewer for a live session — capability access, embeddable as an iframe.
export function interactiveViewerUrl(sessionId: string): string {
  const wdUrl = process.env.NEXT_PUBLIC_WD_URL ?? "http://localhost:3001";

  return `${wdUrl}/interactive?path=sessions/${encodeURIComponent(sessionId)}/se/vnc`;
}

// A WebDriver command against a live session, authorized by possession of the id (capability) — the
// proxy ride is only for same-origin convenience.
async function wdRequest(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`/api/wd/${path}`, init);

  if (res.status === 401) {
    bounceToLogin();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; value?: { message?: string } };
    throw new Error(body.value?.message ?? body.message ?? `wd ${path} → ${res.status}`);
  }
}

export function killSession(sessionId: string): Promise<void> {
  return wdRequest(`sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

// W3C Navigate To — plain WebDriver traffic, same as any client of the session would send. Navigate
// wants an absolute URL, so a pasted bare host gets the obvious scheme.
export function navigateSession(sessionId: string, url: string): Promise<void> {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;

  return wdRequest(`sessions/${encodeURIComponent(sessionId)}/url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: absolute }),
  });
}

// The liveness probe asks the NODE's status (the wd vendor route), never the session itself: a
// session command would count as the user's traffic and reset the idle timeout — a watcher must not
// keep an abandoned session alive. No DB, no state, nothing done on the user's behalf.
export async function isSessionAlive(sessionId: string): Promise<boolean> {
  const res = await fetch(`/api/wd/sessions/${encodeURIComponent(sessionId)}/sw/alive`);

  if (!res.ok) {
    return false;
  }

  const body = (await res.json()) as { alive?: boolean };

  return body.alive === true;
}

// Where a project's session logs/video are written. Credentials are never here — access is delegated
// to our service identity by a bucket policy on the user's bucket.
export interface StorageDestination {
  name: string;
  bucket: string;
  prefix: string;
  endpoint?: string;
  region?: string;
}

export interface StorageDestinationInput {
  bucket: string;
  prefix?: string;
  endpoint?: string;
  region?: string;
}

// Null when the project has not configured a destination yet (a 404, not an error).
export async function getStorageDestination(project: string): Promise<StorageDestination | null> {
  const res = await fetch(`/api/sw/v1/projects/${project}/storageDestination`, {
    headers: { accept: "application/json" },
  });

  if (res.status === 401) {
    bounceToLogin();
  }

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`storage destination → ${res.status}`);
  }

  return (await res.json()) as StorageDestination;
}

export function updateStorageDestination(
  project: string,
  input: StorageDestinationInput,
): Promise<StorageDestination> {
  return swRequest<StorageDestination>(`v1/projects/${project}/storageDestination`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
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
