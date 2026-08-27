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
  state: string; // enqueued | starting | preparing | executing | deleting | deleted | failed
  stateReason?: string;
  platform: { name: string; version: string; deviceModel?: string };
  execution: string;
  applications: Array<{ name: string; version: string }>;
  createTime: string;
}

export interface CreateEnvironmentInput {
  platform: { name: string; version: string; deviceModel?: string };
  applications: Array<{ name: string; version: string }>;
  execution: string;
  environmentId?: string;
}

// The URL handle a resource is addressed by (nested resources live under it).
export function projectHandle(project: Project): string {
  return project.name.replace(/^projects\//, "");
}

export function environmentHandle(environment: Environment): string {
  return environment.name.replace(/^projects\/[^/]+\/environments\//, "");
}

async function swRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/sw/${path}`, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });

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
