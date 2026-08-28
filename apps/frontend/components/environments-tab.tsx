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
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  createEnvironment,
  deleteEnvironment,
  environmentHandle,
  listCloudAccounts,
  listEnvironments,
} from "@/lib/sw";

const STATE_COLOR: Record<string, string> = {
  enqueued: "blue",
  starting: "yellow",
  preparing: "yellow",
  executing: "green",
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
        <Button leftSection={<IconPlus size={16} />} disabled>
          New session
        </Button>
      </Group>

      {environments.error && <Alert color="red">{(environments.error as Error).message}</Alert>}
      {remove.error && <Alert color="red">{(remove.error as Error).message}</Alert>}

      {environments.isLoading ? (
        <Loader size="sm" />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Platform</Table.Th>
              <Table.Th>Apps</Table.Th>
              <Table.Th>Execution</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((e) => {
              const handle = environmentHandle(e);
              // Soft-deleted rows linger in the list until GC removes them — nothing left to delete.
              const gone = ["deleting", "deleted"].includes(e.state.toLowerCase());

              return (
                <Table.Tr key={e.uid}>
                  <Table.Td>{handle}</Table.Td>
                  <Table.Td>
                    <Badge color={STATE_COLOR[e.state.toLowerCase()] ?? "gray"} variant="light">
                      {e.state.toLowerCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {e.platform.name} {e.platform.version}
                  </Table.Td>
                  <Table.Td>{e.applications.map((a) => `${a.name} ${a.version}`).join(", ")}</Table.Td>
                  <Table.Td>{e.execution}</Table.Td>
                  <Table.Td>
                    {!gone && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete environment"
                        loading={remove.isPending && remove.variables === handle}
                        onClick={() => remove.mutate(handle)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" size="sm" ta="center" py="sm">
                    No environments yet
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

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
