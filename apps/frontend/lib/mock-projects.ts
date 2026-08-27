// Placeholder project list for the sidebar until step 2 wires the real GET /v1/projects via the BFF.
export interface MockProject {
  id: string;
  displayName: string;
  created: string;
}

export const MOCK_PROJECTS: MockProject[] = [
  { id: "team-a", displayName: "team-a", created: "2d ago" },
  { id: "my-bots", displayName: "my-bots", created: "5d ago" },
  { id: "demo", displayName: "demo", created: "1w ago" },
];
