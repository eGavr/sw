"use client";

import { Badge, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

const MOCK_PROJECTS = [
  { name: "team-a", id: "team-a", compute: "docker", created: "2d ago" },
  { name: "my-bots", id: "7f3c…", compute: "kubernetes", created: "5d ago" },
  { name: "demo", id: "demo", compute: "android", created: "1w ago" },
];

export default function ProjectsPage() {
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Projects</Title>
        <Button leftSection={<IconPlus size={16} />} disabled>
          New project
        </Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>ID</Table.Th>
            <Table.Th>Compute</Table.Th>
            <Table.Th>Created</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {MOCK_PROJECTS.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td>{p.name}</Table.Td>
              <Table.Td>
                <Text c="dimmed" ff="monospace" size="sm">
                  {p.id}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">{p.compute}</Badge>
              </Table.Td>
              <Table.Td>{p.created}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Text size="xs" c="dimmed">
        Mock data — real projects (auth + BFF) land in step 2.
      </Text>
    </Stack>
  );
}
