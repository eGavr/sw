"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlayerPlay, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BusySessionLink } from "@/components/busy-session-link";
import { NewSessionModal } from "@/components/new-session-modal";
import {
  createEnvironment,
  deleteEnvironment,
  Environment,
  environmentHandle,
  listCloudAccounts,
  listEnvironments,
} from "@/lib/sw";
import { loadFreeing } from "@/lib/freeing-store";
import { shortId } from "@/lib/format";

// The wire statuses of GET environments (EnvironmentStatus): ACTIVE is "executing and heartbeating".
const STATE_COLOR: Record<string, string> = {
  enqueued: "blue",
  preparing: "yellow",
  active: "green",
  unhealthy: "orange",
  deleting: "gray",
  deleted: "gray",
  failed: "red",
};

export function EnvironmentsTab({ project }: { project: string }) {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const [platformName, setPlatformName] = useState("linux");
  const [platformVersion, setPlatformVersion] = useState("1");
  const [appName, setAppName] = useState("chrome");
  const [appVersion, setAppVersion] = useState("128");
  const [execution, setExecution] = useState("container");
  const [sessionTarget, setSessionTarget] = useState<Environment | null>(null);

  const environments = useQuery({
    queryKey: ["environments", project],
    queryFn: () => listEnvironments(project),
    refetchInterval: 3_000,
  });

  // An environment lands on a connected cloud, so without one the create button leads nowhere —
  // guard it up front instead of letting the API reject with 409 after the fact.
  const clouds = useQuery({
    queryKey: ["cloudAccounts", project],
    queryFn: () => listCloudAccounts(project),
  });
  const noClouds = !clouds.isLoading && (clouds.data ?? []).length === 0;

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["environments", project] });

  const create = useMutation({
    mutationFn: () =>
      createEnvironment(project, {
        platform: { name: platformName, version: platformVersion },
        applications: [{ name: appName, version: appVersion }],
        execution,
      }),
    onSuccess: async () => {
      await invalidate();
      close();
    },
  });

  const remove = useMutation({
    mutationFn: (handle: string) => deleteEnvironment(project, handle),
    onSuccess: invalidate,
  });

  const rows = environments.data ?? [];
  // Sessions we just killed (marker written by the Sessions tab): read per render — the store prunes
  // expired entries on every read, so nothing sticks and the 3s list poll doubles as the refresh.
  const freeing = loadFreeing();

  return (
    <Stack>
      <Group justify="flex-end">
        <Tooltip label="Connect a cloud on the Clouds tab first" disabled={!noClouds}>
          <Button
            variant="default"
            leftSection={<IconPlus size={16} />}
            data-disabled={noClouds || undefined}
            onClick={(event) => (noClouds ? event.preventDefault() : open())}
          >
            New environment
          </Button>
        </Tooltip>
      </Group>

      {environments.error && <Alert color="red">{(environments.error as Error).message}</Alert>}
      {remove.error && <Alert color="red">{(remove.error as Error).message}</Alert>}

      {environments.isLoading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Id</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Occupancy</Table.Th>
              <Table.Th>Platform</Table.Th>
              <Table.Th>Apps</Table.Th>
              <Table.Th>Execution</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((e) => {
              const handle = environmentHandle(e);
              // Soft-deleted rows linger in the list until GC removes them — nothing left to delete.
              const gone = ["deleting", "deleted"].includes(e.state.toLowerCase());
              const active = e.state.toLowerCase() === "active";
              const busy = e.occupancy === "BUSY";
              const reserved = e.occupancy === "RESERVED";

              return (
                <Table.Tr key={e.uid}>
                  <Table.Td>
                    <Tooltip label={handle} disabled={handle === shortId(handle)}>
                      <Text size="sm" ff="monospace" style={{ cursor: "default", width: "fit-content" }}>
                        {shortId(handle)}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATE_COLOR[e.state.toLowerCase()] ?? "gray"} variant="light">
                      {e.state.toLowerCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {/* Session actions live next to the occupancy word they depend on: start on a
                        free row, jump to the running session on a busy one. */}
                    {active ? (
                      busy && freeing.has(e.uid) ? (
                        <Badge color="gray" variant="light" leftSection={<Loader size={8} color="gray" />}>
                          freeing
                        </Badge>
                      ) : reserved ? (
                        <Badge color="gray" variant="light" leftSection={<Loader size={8} color="gray" />}>
                          reserved
                        </Badge>
                      ) : (
                        <Group gap={2} wrap="nowrap">
                          <Badge color={busy ? "orange" : "green"} variant="light">
                            {busy ? "busy" : "free"}
                          </Badge>
                          {busy && e.capabilities?.canAccessCurrentSession && (
                            <BusySessionLink environmentUid={e.uid} />
                          )}
                          {!busy && (
                            <Tooltip label="New session on this environment">
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="New session"
                                onClick={() => setSessionTarget(e)}
                              >
                                <IconPlayerPlay size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      )
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {e.platform.name} {e.platform.version}
                  </Table.Td>
                  <Table.Td>{e.applications.map((a) => `${a.name} ${a.version}`).join(", ")}</Table.Td>
                  <Table.Td>{e.execution}</Table.Td>
                  <Table.Td>
                    {!gone ? (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete environment"
                        loading={remove.isPending && remove.variables === handle}
                        onClick={() => remove.mutate(handle)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" size="sm" ta="center" py="sm">
                    No environments yet
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <NewSessionModal
        project={project}
        environment={sessionTarget}
        onClose={() => setSessionTarget(null)}
      />


      <Modal opened={opened} onClose={close} title="New environment">
        <Stack>
          <Group grow>
            <TextInput
              label="Platform"
              value={platformName}
              onChange={(e) => setPlatformName(e.currentTarget.value)}
            />
            <TextInput
              label="Version"
              value={platformVersion}
              onChange={(e) => setPlatformVersion(e.currentTarget.value)}
            />
          </Group>
          <Group grow>
            <TextInput
              label="Application"
              value={appName}
              onChange={(e) => setAppName(e.currentTarget.value)}
            />
            <TextInput
              label="App version"
              value={appVersion}
              onChange={(e) => setAppVersion(e.currentTarget.value)}
            />
          </Group>
          <Select
            label="Execution"
            data={[
              { value: "container", label: "container" },
              { value: "emulator", label: "emulator (soon)", disabled: true },
              { value: "device", label: "device (soon)", disabled: true },
            ]}
            value={execution}
            onChange={(v) => setExecution(v ?? "container")}
          />
          {create.error && (
            <Text c="red" size="sm">
              {(create.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
