"use client";

import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Group,
  Loader,
  Menu,
  NavLink,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLogout, IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { NewProjectModal } from "@/components/new-project-modal";
import { listProjects, projectHandle } from "@/lib/sw";

export function DashboardShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string | null;
}) {
  const [opened, { toggle }] = useDisclosure();
  const [newProjectOpened, { open: openNewProject, close: closeNewProject }] = useDisclosure(false);
  const pathname = usePathname();
  const segments = pathname.split("/");
  const selectedProjectId = segments[1] === "projects" ? segments[2] : undefined;

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg">
              sw
            </Text>
          </Group>
          <Menu withArrow position="bottom-end">
            <Menu.Target>
              <Avatar radius="xl" size="sm" style={{ cursor: "pointer" }} />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{userEmail ?? "Signed in"}</Menu.Label>
              <form action={signOutAction}>
                <Menu.Item component="button" type="submit" leftSection={<IconLogout size={16} />}>
                  Sign out
                </Menu.Item>
              </form>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Group justify="space-between" px="xs" pb={4}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Projects
          </Text>
          <Tooltip label="New project">
            <ActionIcon variant="subtle" size="sm" aria-label="New project" onClick={openNewProject}>
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {isLoading ? (
          <Group px="xs" py="xs">
            <Loader size="xs" />
          </Group>
        ) : projects && projects.length > 0 ? (
          projects.map((p) => {
            const handle = projectHandle(p);

            return (
              <NavLink
                key={p.uid}
                component={Link}
                href={`/projects/${handle}`}
                label={p.displayName}
                active={handle === selectedProjectId}
              />
            );
          })
        ) : (
          <Text size="sm" c="dimmed" px="xs" py="xs">
            No projects yet
          </Text>
        )}

      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <NewProjectModal opened={newProjectOpened} onClose={closeNewProject} />
    </AppShell>
  );
}
