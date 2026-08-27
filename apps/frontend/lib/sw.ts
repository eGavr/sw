// Client-side sw access: every call goes through the same-origin BFF proxy (/api/sw/*), which adds the
// Bearer token on the server. The browser never holds a token.

export interface Project {
  name: string; // "projects/{handle}" — handle is the human id when set, else the uid
  uid: string;
  displayName: string;
  createTime: string;
  updateTime: string;
}

// The URL handle a project is addressed by (nested resources live under it).
export function projectHandle(project: Project): string {
  return project.name.replace(/^projects\//, "");
}

export async function swGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/sw/${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`sw ${path} → ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function listProjects(): Promise<Array<Project>> {
  const data = await swGet<{ projects?: Array<Project> }>("v1/projects");

  return data.projects ?? [];
}
