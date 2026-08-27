"use client";

import { Badge, Box, Button, Drawer, Group, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

interface Provider {
  provider: string;
  displayName: string;
  platform: string;
  execution: string;
  state: string;
  config: Record<string, string | number>;
}

// Mock until step 2/3. `config` is the non-secret provisioning blob the adapter interprets — for a
// Yandex-backed provider it carries zone / image / sizing; credentials live in a secret store.
const MOCK_PROVIDERS: Provider[] = [
  {
    provider: "docker",
    displayName: "Local Docker",
    platform: "linux",
    execution: "container",
    state: "active",
    config: { image: "selenium/standalone-chrome:128", port: 4444 },
  },
  {
    provider: "android-redroid",
    displayName: "YC redroid farm",
    platform: "android",
    execution: "container",
    state: "active",
    config: {
      imageId: "fd8f6dm4hjp2rqn5q7tq",
      zone: "ru-central1-a",
      subnetId: "e9bcp55uhm61e0jln645",
      cores: 8,
      memoryGb: 16,
      diskSizeGb: 40,
    },
  },
];

// Human-friendly "where does this run" derived from the (adapter, config). The model has no explicit
// cloud field — a zone implies Yandex Cloud; docker/k8s are local/cluster.
function runsOn(provider: string, config: Record<string, string | number>): string {
  const zone = typeof config.zone === "string" ? config.zone : undefined;
  if (zone) {
    return `Yandex Cloud · ${zone}`;
  }
  if (provider === "kubernetes") {
    return "Kubernetes cluster";
  }
  if (provider === "docker") {
    return "Local Docker (host)";
  }

  return "—";
}

export function ProvidersTab() {
  const [opened, { open, close }] = useDisclosure(false);
  const [selected, setSelected] = useState<Provider | null>(null);

  const show = (provider: Provider): void => {
    setSelected(provider);
    open();
  };

  return (
    <Stack>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} disabled>
          Add provider
        </Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Provider</Table.Th>
            <Table.Th>Platform</Table.Th>
            <Table.Th>Execution</Table.Th>
            <Table.Th>State</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {MOCK_PROVIDERS.map((p) => (
            <Table.Tr key={p.provider} style={{ cursor: "pointer" }} onClick={() => show(p)}>
              <Table.Td>{p.displayName}</Table.Td>
              <Table.Td>
                <Badge variant="light">{p.provider}</Badge>
              </Table.Td>
              <Table.Td>{p.platform}</Table.Td>
              <Table.Td>{p.execution}</Table.Td>
              <Table.Td>
                <Badge color={p.state === "active" ? "green" : "gray"} variant="light">
                  {p.state}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        title={selected?.displayName ?? "Provider"}
      >
        {selected && (
          <Stack gap="md">
            <Group gap="xs">
              <Badge variant="light">{selected.provider}</Badge>
              <Badge variant="light" color="gray">
                {selected.platform}
              </Badge>
              <Badge variant="light" color="gray">
                {selected.execution}
              </Badge>
              <Badge variant="light" color={selected.state === "active" ? "green" : "gray"}>
                {selected.state}
              </Badge>
            </Group>

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Runs on
              </Text>
              <Text>{runsOn(selected.provider, selected.config)}</Text>
            </Box>

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                Configuration
              </Text>
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
                          {String(value)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>

            <Text size="xs" c="dimmed">
              Credentials are kept in a secret store (credentialRef) and never shown. Config is the
              non-secret provisioning blob — for a Yandex-backed provider it holds zone / image / sizing.
            </Text>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
