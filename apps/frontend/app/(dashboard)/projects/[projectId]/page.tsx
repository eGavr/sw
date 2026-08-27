"use client";

import { Badge, Button, Group, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useParams } from "next/navigation";

import { ProvidersTab } from "@/components/providers-tab";

const MOCK_ENVIRONMENTS = [
  { name: "env-1", state: "executing", platform: "linux", apps: "chrome 128" },
  { name: "env-2", state: "preparing", platform: "linux", apps: "chrome 128" },
  { name: "env-3", state: "failed", platform: "android", apps: "—" },
];

const STATE_COLOR: Record<string, string> = {
  enqueued: "blue",
  starting: "yellow",
  preparing: "yellow",
  executing: "green",
  deleting: "gray",
  failed: "red",
};

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <Stack>
      <Title order={2}>{projectId}</Title>

      <Tabs defaultValue="environments">
        <Tabs.List>
          <Tabs.Tab value="environments">Environments</Tabs.Tab>
          <Tabs.Tab value="providers">Providers</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="environments" pt="md">
          <Stack>
            <Group justify="flex-end">
              <Button variant="default" leftSection={<IconPlus size={16} />} disabled>
                New environment
              </Button>
              <Button leftSection={<IconPlus size={16} />} disabled>
                New session
              </Button>
            </Group>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>State</Table.Th>
                  <Table.Th>Platform</Table.Th>
                  <Table.Th>Apps</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MOCK_ENVIRONMENTS.map((e) => (
                  <Table.Tr key={e.name}>
                    <Table.Td>{e.name}</Table.Td>
                    <Table.Td>
                      <Badge color={STATE_COLOR[e.state] ?? "gray"} variant="light">
                        {e.state}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{e.platform}</Table.Td>
                    <Table.Td>{e.apps}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="providers" pt="md">
          <ProvidersTab />
        </Tabs.Panel>
      </Tabs>

      <Text size="xs" c="dimmed">
        Mock data — real project data (auth + BFF) lands in steps 2–3.
      </Text>
    </Stack>
  );
}
