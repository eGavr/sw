import { useQuery } from "@tanstack/react-query";

import { listMachines, Machine } from "@/lib/sw";

export const machinesQueryKey = (project: string, cloudAccount: string): Array<string> =>
  ["machines", project, cloudAccount];

// A self-hosted cloud's machines, polled on the agents' sync cadence so state, conditions and seats
// stay live. Disabled (no request, empty list) when the project has no such cloud.
export function useMachines(project: string, cloudAccount: string | undefined) {
  return useQuery<Array<Machine>>({
    queryKey: machinesQueryKey(project, cloudAccount ?? ""),
    queryFn: () => listMachines(project, cloudAccount as string),
    enabled: cloudAccount !== undefined,
    refetchInterval: 3_000,
  });
}
