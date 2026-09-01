"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  CloudAccount,
  connectCloud,
  disconnectCloud,
  listCloudAccounts,
  listCloudTypes,
  Substrate,
  testCloudAccount,
} from "@/lib/sw";

function SubstrateBadges({ provides }: { provides: Array<Substrate> }) {
  return (
    <Group gap={4}>
      {provides.map((s) => (
        <Badge key={`${s.platform}:${s.execution}`} variant="light" color="gray">
          {s.platform} · {s.execution}
        </Badge>
      ))}
    </Group>
  );
}

// Whether the cloud is usable with its current settings — probed under our identity on load (for a
// delegated cloud, that the user has granted us access). Red with the backend's detail when not, so a
// missing grant surfaces here instead of failing later at provision. Re-checkable on demand.
function CloudReachabilityBadge({ project, uid }: { project: string; uid: string }) {
  const probe = useQuery({
    queryKey: ["cloudAccess", project, uid],
    queryFn: () => testCloudAccount(project, uid),
    retry: false,
  });

  const status = probe.isFetching ? (
    <Group gap={4} c="dimmed">
      <Loader size={12} />
      <Text size="xs">checking…</Text>
    </Group>
  ) : probe.isError ? (
    <Tooltip label={(probe.error as Error).message}>
      <Group gap={4} c="red">
        <IconAlertTriangle size={14} />
        <Text size="xs">unavailable</Text>
      </Group>
    </Tooltip>
  ) : probe.data?.ok ? (
    <Group gap={4} c="green">
      <IconCircleCheck size={14} />
      <Text size="xs">available</Text>
    </Group>
  ) : (
    <Tooltip label={probe.data?.message}>
      <Group gap={4} c="red">
        <IconAlertTriangle size={14} />
        <Text size="xs">unavailable</Text>
      </Group>
    </Tooltip>
  );

  return (
    <Group gap={4} wrap="nowrap">
      {status}
      <Tooltip label="Re-check">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Re-check cloud"
          loading={probe.isFetching}
          onClick={() => void probe.refetch()}
        >
          <IconRefresh size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function CloudsTab({ project }: { project: string }) {
  const queryClient = useQueryClient();
  const [connectOpened, { open: openConnect, close: closeConnect }] = useDisclosure(false);
  const [detailsOpened, { open: openDetails, close: closeDetails }] = useDisclosure(false);
  // Quiet by default: the connect/disconnect affordances only show while managing (pencil). Changes are
  // STAGED — connecting adds a pending row, the trash marks a row for removal — and applied on Save, so
  // the block reads like the others (pencil to edit, Cancel/Save to leave).
  const [managing, setManaging] = useState(false);
  const [pendingConnect, setPendingConnect] = useState<Array<string>>([]);
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selected, setSelected] = useState<CloudAccount | null>(null);

  const clouds = useQuery({
    queryKey: ["cloudAccounts", project],
    queryFn: () => listCloudAccounts(project),
  });

  // The install-static catalogue of connectable clouds; it only changes with a server release.
  const cloudTypes = useQuery({
    queryKey: ["cloudTypes"],
    queryFn: listCloudTypes,
    staleTime: Infinity,
  });

  const rows = clouds.data ?? [];
  const catalogue = cloudTypes.data ?? [];
  const selectedCatalogueEntry = catalogue.find((t) => t.type === selectedType);
  const providesFor = (type: string): Array<Substrate> =>
    catalogue.find((t) => t.type === type)?.provides ?? [];

  const hasChanges = pendingConnect.length > 0 || pendingRemove.size > 0;

  const clearPending = (): void => {
    setPendingConnect([]);
    setPendingRemove(new Set());
  };

  const toggleRemove = (uid: string): void => {
    const next = new Set(pendingRemove);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    setPendingRemove(next);
  };

  // Apply the staged changes on Save: removals then connections, all attempted, the first failure
  // surfaced. Whatever the outcome, refresh from the server and leave managing — the table then shows
  // the real state.
  const save = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([
        ...[...pendingRemove].map((uid) => disconnectCloud(project, uid)),
        ...pendingConnect.map((type) => connectCloud(project, type)),
      ]);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
      }
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Some cloud changes failed", message: (error as Error).message }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] });
      clearPending();
      setManaging(false);
    },
  });

  const addPending = (): void => {
    if (selectedType) {
      setPendingConnect([...pendingConnect, selectedType]);
    }
    closeConnect();
    setSelectedType(null);
  };

  const cancel = (): void => {
    clearPending();
    setManaging(false);
  };

  const show = (cloud: CloudAccount): void => {
    setSelected(cloud);
    openDetails();
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Title order={4}>Cloud</Title>
          <Text size="sm" c="dimmed">
            Where this project&apos;s environments run. Connect a cloud to create environments on it.
          </Text>
        </Box>
        {managing ? (
          <Group gap="xs">
            <Button variant="default" size="compact-sm" onClick={cancel}>
              Cancel
            </Button>
            <Button
              variant="light"
              size="compact-sm"
              loading={save.isPending}
              disabled={!hasChanges}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </Group>
        ) : (
          <Tooltip label="Edit">
            <ActionIcon variant="subtle" color="gray" aria-label="Edit clouds" onClick={() => setManaging(true)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {clouds.error && <Alert color="red">{(clouds.error as Error).message}</Alert>}

      {clouds.isLoading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cloud</Table.Th>
              <Table.Th>Provides</Table.Th>
              <Table.Th>Connected</Table.Th>
              <Table.Th>Available</Table.Th>
              {managing && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((cloud) => {
              const removing = pendingRemove.has(cloud.uid);

              return (
                <Table.Tr
                  key={cloud.uid}
                  style={{ cursor: managing ? "default" : "pointer", opacity: removing ? 0.45 : 1 }}
                  onClick={() => !managing && show(cloud)}
                >
                  <Table.Td>
                    <Badge variant="light" td={removing ? "line-through" : undefined}>
                      {cloud.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <SubstrateBadges provides={cloud.provides} />
                  </Table.Td>
                  <Table.Td>{new Date(cloud.createTime).toLocaleDateString()}</Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <CloudReachabilityBadge project={project} uid={cloud.uid} />
                  </Table.Td>
                  {managing && (
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Tooltip label={removing ? "Keep" : "Disconnect"}>
                        <ActionIcon
                          variant="subtle"
                          color={removing ? "gray" : "red"}
                          aria-label={removing ? "Keep cloud" : "Disconnect cloud"}
                          onClick={() => toggleRemove(cloud.uid)}
                        >
                          {removing ? <IconArrowBackUp size={16} /> : <IconTrash size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
            {managing &&
              pendingConnect.map((type, index) => (
                <Table.Tr key={`pending-${index}`}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge variant="light" color="green">
                        {type}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        will connect
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <SubstrateBadges provides={providesFor(type)} />
                  </Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>
                    <Tooltip label="Remove">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Remove pending cloud"
                        onClick={() => setPendingConnect(pendingConnect.filter((_, i) => i !== index))}
                      >
                        <IconArrowBackUp size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            {rows.length === 0 && pendingConnect.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={managing ? 5 : 4}>
                  <Text c="dimmed" size="sm" ta="center" py="sm">
                    No clouds connected — connect one to create environments
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      {managing && (
        <Group>
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            onClick={openConnect}
          >
            Connect a cloud
          </Button>
        </Group>
      )}

      <Modal
        opened={connectOpened}
        onClose={() => {
          closeConnect();
          setSelectedType(null);
        }}
        title="Connect cloud"
      >
        <Stack>
          <Select
            label="Cloud"
            placeholder={cloudTypes.isLoading ? "Loading…" : "Pick a cloud type"}
            data={catalogue.map((t) => ({ value: t.type, label: t.type }))}
            value={selectedType}
            onChange={setSelectedType}
          />
          {selectedCatalogueEntry && (
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                Provides
              </Text>
              <SubstrateBadges provides={selectedCatalogueEntry.provides} />
            </Box>
          )}
          <Text size="xs" c="dimmed">
            Added to the list — it is connected when you Save.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConnect}>
              Cancel
            </Button>
            <Button variant="light" disabled={!selectedType} onClick={addPending}>
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        opened={detailsOpened}
        onClose={closeDetails}
        position="right"
        title={selected ? selected.type : "Cloud"}
      >
        {selected && (
          <Stack gap="md">
            <Group gap="xs">
              <Badge variant="light">{selected.type}</Badge>
            </Group>

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                Provides
              </Text>
              <SubstrateBadges provides={selected.provides} />
            </Box>

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                Configuration
              </Text>
              {Object.keys(selected.config).length === 0 ? (
                <Text size="sm" c="dimmed">
                  Install defaults (no per-project overrides)
                </Text>
              ) : (
                <Table withTableBorder withColumnBorders>
                  <Table.Tbody>
                    {Object.entries(selected.config).map(([key, value]) => (
                      <Table.Tr key={key}>
                        <Table.Td>
                          <Text ff="monospace" size="sm">
                            {key}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text ff="monospace" size="sm">
                            {JSON.stringify(value)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Box>

            <Text size="xs" c="dimmed">
              Credentials live in a secret store and are never shown. Config is the non-secret
              provisioning blob the cloud&apos;s adapter interprets.
            </Text>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
