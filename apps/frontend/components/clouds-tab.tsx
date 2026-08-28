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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  CloudAccount,
  connectCloud,
  disconnectCloud,
  listCloudAccounts,
  listCloudTypes,
  Substrate,
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

export function CloudsTab({ project }: { project: string }) {
  const queryClient = useQueryClient();
  const [connectOpened, { open: openConnect, close: closeConnect }] = useDisclosure(false);
  const [detailsOpened, { open: openDetails, close: closeDetails }] = useDisclosure(false);

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

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] });

  const connect = useMutation({
    mutationFn: (type: string) => connectCloud(project, type),
    onSuccess: async () => {
      await invalidate();
      closeConnect();
      setSelectedType(null);
    },
  });

  const disconnect = useMutation({
    mutationFn: (cloudAccount: string) => disconnectCloud(project, cloudAccount),
    onSuccess: invalidate,
  });

  const rows = clouds.data ?? [];
  const catalogue = cloudTypes.data ?? [];
  const selectedCatalogueEntry = catalogue.find((t) => t.type === selectedType);

  const show = (cloud: CloudAccount): void => {
    setSelected(cloud);
    openDetails();
  };

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={openConnect}>
          Connect cloud
        </Button>
      </Group>

      {clouds.error && <Alert color="red">{(clouds.error as Error).message}</Alert>}
      {disconnect.error && <Alert color="red">{(disconnect.error as Error).message}</Alert>}

      {clouds.isLoading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cloud</Table.Th>
              <Table.Th>Provides</Table.Th>
              <Table.Th>Connected</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((cloud) => (
              <Table.Tr key={cloud.uid} style={{ cursor: "pointer" }} onClick={() => show(cloud)}>
                <Table.Td>
                  <Badge variant="light">{cloud.type}</Badge>
                </Table.Td>
                <Table.Td>
                  <SubstrateBadges provides={cloud.provides} />
                </Table.Td>
                <Table.Td>{new Date(cloud.createTime).toLocaleDateString()}</Table.Td>
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Disconnect cloud"
                    loading={disconnect.isPending && disconnect.variables === cloud.uid}
                    onClick={() => disconnect.mutate(cloud.uid)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm" ta="center" py="sm">
                    No clouds connected — connect one to create environments
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={connectOpened}
        onClose={() => {
          closeConnect();
          connect.reset();
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
          {connect.error && (
            <Text c="red" size="sm">
              {(connect.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConnect}>
              Cancel
            </Button>
            <Button
              disabled={!selectedType}
              loading={connect.isPending}
              onClick={() => selectedType && connect.mutate(selectedType)}
            >
              Connect
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
