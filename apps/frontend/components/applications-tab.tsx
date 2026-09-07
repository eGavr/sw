"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  addApplicationBuild,
  ApplicationVersion,
  catalogProject,
  createProjectApplication,
  deleteProjectApplication,
  listApplicationBuilds,
  listPlatforms,
  listProjectApplications,
  ProjectApplication,
} from "@/lib/sw";

// The applications an environment of this project can install, per platform: the install's catalog
// (the reserved `catalog` project — every project reads it, its members grow it) and the project's own
// registrations, which override the catalog word for word. An application is one word; its builds
// carry the artifacts — a bucket key of the project's storage or a URL, plus the paired webdriver a
// browser needs. The honest identity (package id, version) is detected on the environment at
// delivery, never typed here.
export function ApplicationsTab({ project }: { project: string }) {
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: listPlatforms, staleTime: Infinity });
  const [platform, setPlatform] = useState("");

  const lines = platforms.data ?? [];

  useEffect(() => {
    if (lines.length > 0 && !lines.some((line) => line.platform === platform)) {
      setPlatform(lines[0].platform);
    }
  }, [lines, platform]);

  const ownsCatalog = project === catalogProject;

  return (
    <Stack gap="lg">
      <Group align="flex-end">
        <Select
          label="Platform"
          data={lines.map((line) => line.platform)}
          value={platform}
          onChange={(value) => value && setPlatform(value)}
          w={200}
        />
      </Group>

      {platforms.error && <Alert color="red">{(platforms.error as Error).message}</Alert>}

      {platform && (
        <>
          {!ownsCatalog && (
            <ApplicationSection
              title="Catalog"
              description="Provided by the install — every project's defaults; register the same word below to override one."
              owner={catalogProject}
              platform={platform}
              editable={false}
            />
          )}
          <ApplicationSection
            title={ownsCatalog ? "Catalog" : "This project"}
            description={
              ownsCatalog
                ? "The install's provided set: every project reads it, only its members change it."
                : "Your own builds — an APK or a browser archive in the project's storage (a key) or at a URL, with its webdriver. A catalog word registered here overrides the catalog's."
            }
            owner={project}
            platform={platform}
            editable
          />
        </>
      )}
    </Stack>
  );
}

function ApplicationSection({
  title,
  description,
  owner,
  platform,
  editable,
}: {
  title: string;
  description: string;
  owner: string;
  platform: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ["projectApplications", owner, platform],
    queryFn: () => listProjectApplications(owner, platform),
  });
  const [word, setWord] = useState("");

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["projectApplications", owner, platform] });

  const register = useMutation({
    mutationFn: () => createProjectApplication(owner, platform, word.trim()),
    onSuccess: async () => {
      setWord("");
      await invalidate();
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Not registered", message: (error as Error).message }),
  });

  const remove = useMutation({
    mutationFn: (application: string) => deleteProjectApplication(owner, platform, application),
    onSuccess: invalidate,
    onError: (error) =>
      notifications.show({ color: "red", title: "Not deleted", message: (error as Error).message }),
  });

  const rows = applications.data ?? [];

  return (
    <Stack gap="sm">
      <Box>
        <Title order={4}>{title}</Title>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </Box>

      {applications.error && <Alert color="red">{(applications.error as Error).message}</Alert>}
      {applications.isLoading && <Loader size="sm" />}
      {!applications.isLoading && rows.length === 0 && (
        <Text size="sm" c="dimmed">
          Nothing on {platform} yet.
        </Text>
      )}

      {rows.map((application) => (
        <ApplicationCard
          key={application.uid}
          owner={owner}
          platform={platform}
          application={application}
          editable={editable}
          onDelete={() => remove.mutate(application.uid)}
        />
      ))}

      {editable && (
        <Group align="flex-end">
          <TextInput
            label="Register an application"
            description="One word to address it by — myapp, or chrome to override the catalog's chrome."
            placeholder="myapp"
            value={word}
            onChange={(event) => setWord(event.currentTarget.value)}
            w={280}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            loading={register.isPending}
            disabled={word.trim() === ""}
            onClick={() => register.mutate()}
          >
            Register
          </Button>
        </Group>
      )}
    </Stack>
  );
}

// One application with its builds, newest last (registration order — a session asking "latest" gets
// the last registered build).
function ApplicationCard({
  owner,
  platform,
  application,
  editable,
  onDelete,
}: {
  owner: string;
  platform: string;
  application: ProjectApplication;
  editable: boolean;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const builds = useQuery({
    queryKey: ["applicationBuilds", owner, platform, application.uid],
    queryFn: () => listApplicationBuilds(owner, platform, application.uid),
  });
  const [adding, setAdding] = useState(false);
  const [versionAlias, setVersionAlias] = useState("");
  const [appRef, setAppRef] = useState("");
  const [webdriverRef, setWebdriverRef] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addApplicationBuild(owner, platform, application.uid, {
        versionAlias: versionAlias.trim(),
        ...(appRef.trim() ? { appRef: appRef.trim() } : {}),
        ...(webdriverRef.trim() ? { webdriverRef: webdriverRef.trim() } : {}),
      }),
    onSuccess: async () => {
      setVersionAlias("");
      setAppRef("");
      setWebdriverRef("");
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ["applicationBuilds", owner, platform, application.uid] });
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Build not added", message: (error as Error).message }),
  });

  const list = builds.data ?? [];

  return (
    <Box p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}>
      <Group justify="space-between">
        <Group gap="xs">
          <Text fw={600}>{application.nameAlias}</Text>
          <Badge variant="light" size="sm">
            {list.length} {list.length === 1 ? "build" : "builds"}
          </Badge>
        </Group>
        {editable && (
          <Group gap="xs">
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setAdding((v) => !v)}>
              Add build
            </Button>
            <Tooltip label="Unregister — environments already created keep their snapshot">
              <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label="Unregister">
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>

      {builds.isLoading && <Loader size="xs" mt="xs" />}
      {list.length > 0 && (
        <Table mt="xs" withRowBorders={false} verticalSpacing={4}>
          <Table.Tbody>
            {list.map((build: ApplicationVersion) => (
              <Table.Tr key={build.uid}>
                <Table.Td w={140}>
                  <Code>{build.versionAlias}</Code>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
                    {build.appRef ?? "preinstalled"}
                    {build.webdriverRef ? ` · webdriver: ${build.webdriverRef}` : ""}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {adding && (
        <Stack gap="xs" mt="sm">
          <Group grow align="flex-end">
            <TextInput
              label="Version alias"
              description="Your label for the build (the honest version is detected on the environment)"
              placeholder="e2e-1"
              value={versionAlias}
              onChange={(event) => setVersionAlias(event.currentTarget.value)}
            />
            <TextInput
              label="App artifact"
              description="Object key in the project's storage, or a URL"
              placeholder="builds/myapp.apk"
              value={appRef}
              onChange={(event) => setAppRef(event.currentTarget.value)}
            />
            <TextInput
              label="Webdriver (browsers)"
              description="The paired chromedriver / geckodriver archive"
              placeholder="builds/chromedriver.zip"
              value={webdriverRef}
              onChange={(event) => setWebdriverRef(event.currentTarget.value)}
            />
          </Group>
          <Group justify="flex-end">
            <Button size="compact-sm" variant="subtle" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="compact-sm"
              loading={add.isPending}
              disabled={versionAlias.trim() === ""}
              onClick={() => add.mutate()}
            >
              Add
            </Button>
          </Group>
        </Stack>
      )}
    </Box>
  );
}
