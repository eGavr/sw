"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPlayerPlay, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BusySessionLink } from "@/components/busy-session-link";
import { NewSessionModal } from "@/components/new-session-modal";
import {
  createEnvironment,
  deleteEnvironment,
  Environment,
  environmentHandle,
  getEnvironmentSession,
  killSession,
  listCloudAccounts,
  listEnvironmentsPage,
} from "@/lib/sw";
import { addFreeing, loadFreeing, removeFreeing } from "@/lib/freeing-store";
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

  const [platformName, setPlatformName] = useState("ubuntu");
  const [platformVersion, setPlatformVersion] = useState("24.04");
  const [appName, setAppName] = useState("chrome");
  // Empty app version = latest: the catalog resolves the newest full version it offers.
  const [appVersion, setAppVersion] = useState("");
  const [execution, setExecution] = useState("container");
  const [sessionTarget, setSessionTarget] = useState<Environment | null>(null);
  // A busy environment's delete asks first: deprovision kills the running session with the container,
  // and its logs/video die unshipped (the agent uploads them on session end — here it dies too).
  const [confirmTarget, setConfirmTarget] = useState<Environment | null>(null);

  // The 3s poll refetches every loaded page (react-query re-runs the whole page chain on interval), so
  // state/occupancy stay live across all loaded pages — and the freeing-marker effect and mutation
  // invalidations below keep working over the flattened union of those pages.
  const environments = useInfiniteQuery({
    queryKey: ["environments", project],
    queryFn: ({ pageParam }) => listEnvironmentsPage(project, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    refetchInterval: 3_000,
  });

  // An environment lands on a BOUND platform of a connected cloud — a connection with no platform
  // bindings serves nothing, so the guard keys on bindings, not on the connection existing. Guard up
  // front instead of letting the API reject with 409 after the fact.
  const clouds = useQuery({
    queryKey: ["cloudAccounts", project],
    queryFn: () => listCloudAccounts(project),
  });
  const noClouds = !clouds.isLoading
    && !(clouds.data ?? []).some((cloud) => cloud.computeBindings.length > 0);

  // An environment can only land on a substrate the project actually BOUND, so the execution choices
  // are exactly the executions bound for the typed platform (emulator shows up enabled once its
  // baremetal binding exists — no hardcoded "soon"). Falls back to container before anything is bound.
  const boundExecutions = [
    ...new Set(
      (clouds.data ?? [])
        .flatMap((cloud) => cloud.computeBindings)
        .filter((binding) => binding.platform === platformName)
        .map((binding) => binding.execution),
    ),
  ];
  const executionOptions = (boundExecutions.length > 0 ? boundExecutions : ["container"])
    .map((value) => ({ value, label: value }));

  // Keep the chosen execution valid as the platform changes: snap to the first option the platform
  // actually offers, so the Select never sits on a value no binding serves (e.g. android has only
  // emulator bound, but the field still held the default container).
  useEffect(() => {
    if (!executionOptions.some((option) => option.value === execution)) {
      setExecution(executionOptions[0].value);
    }
  }, [executionOptions, execution]);

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["environments", project] });

  const create = useMutation({
    mutationFn: () =>
      createEnvironment(project, {
        platform: { name: platformName, version: platformVersion },
        applications: [{ name: appName, ...(appVersion ? { version: appVersion } : {}) }],
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

  // Kill the row's current session from here: recover its id (creator-only endpoint) and send the
  // capability DELETE — same path the Sessions tab uses, minus the detour.
  const killCurrentSession = useMutation({
    mutationFn: async (environmentUid: string) => {
      const { sessionId } = await getEnvironmentSession(project, environmentUid);

      await killSession(sessionId);
    },
    onSuccess: (_, environmentUid) => {
      // Bridge the heartbeat gap: the row shows "freeing" until the agent's word clears busy (~3s).
      addFreeing(environmentUid);
      void invalidate();
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Delete session", message: (error as Error).message }),
  });

  const rows = environments.data?.pages.flatMap((page) => page.items) ?? [];

  // A freeing marker only bridges the kill -> heartbeat gap: the moment the row is seen non-busy the
  // bridge has done its job, so retire the marker then — not by TTL. Otherwise a session created
  // within the TTL window would wear the stale "freeing" badge over its honest "busy".
  useEffect(() => {
    rows
      .filter((environment) => environment.occupancy !== "BUSY")
      .forEach((environment) => removeFreeing(environment.uid));
  }, [rows]);

  // Sessions we just killed (marker written on kill): read per render — the store prunes expired
  // entries on every read, so nothing sticks and the 3s list poll doubles as the refresh.
  const freeing = loadFreeing();

  return (
    <Stack>
      <Group justify="flex-end">
        <Tooltip label="Add a cloud platform in Settings first" disabled={!noClouds}>
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
                    {/* The destructive actions gather behind one kebab, sectioned by blast radius:
                        killing the session frees the row, deleting the environment takes the
                        container (and any session on it) down with it. */}
                    {!gone ? (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Actions"
                            loading={
                              (remove.isPending && remove.variables === handle)
                              || (killCurrentSession.isPending && killCurrentSession.variables === e.uid)
                            }
                          >
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {busy && e.capabilities?.canAccessCurrentSession && (
                            <>
                              <Menu.Label>Session</Menu.Label>
                              <Menu.Item
                                color="red"
                                leftSection={<IconX size={14} />}
                                onClick={() => killCurrentSession.mutate(e.uid)}
                              >
                                Delete session
                              </Menu.Item>
                              <Menu.Divider />
                            </>
                          )}
                          <Menu.Label>Environment</Menu.Label>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => (busy ? setConfirmTarget(e) : remove.mutate(handle))}
                          >
                            Delete environment
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
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
            {environments.hasNextPage && (
              <Table.Tr>
                <Table.Td colSpan={7} ta="center">
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    loading={environments.isFetchingNextPage}
                    onClick={() => void environments.fetchNextPage()}
                  >
                    Load more
                  </Button>
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

      <Modal
        opened={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title="Delete a busy environment?"
      >
        <Stack>
          <Text size="sm">
            This environment is running a session. Deleting the environment kills the session with
            it, and the session&apos;s logs and video will not be saved.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              variant="light"
              loading={remove.isPending}
              onClick={() => {
                if (confirmTarget) {
                  remove.mutate(environmentHandle(confirmTarget));
                }

                setConfirmTarget(null);
              }}
            >
              Delete environment
            </Button>
          </Group>
        </Stack>
      </Modal>


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
            data={executionOptions}
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
