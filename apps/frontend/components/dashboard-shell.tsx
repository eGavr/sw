"use client";

import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Divider,
  Group,
  Menu,
  NavLink,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconEye, IconLogout, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOCK_PROJECTS } from "@/lib/mock-projects";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const segments = pathname.split("/");
  const selectedProjectId = segments[1] === "projects" ? segments[2] : undefined;

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
              <Menu.Label>Signed in (mock)</Menu.Label>
              <Menu.Item leftSection={<IconLogout size={16} />} disabled>
                Sign out
              </Menu.Item>
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
            <ActionIcon variant="subtle" size="sm" disabled aria-label="New project">
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {MOCK_PROJECTS.map((p) => (
          <NavLink
            key={p.id}
            component={Link}
            href={`/projects/${p.id}`}
            label={p.displayName}
            active={p.id === selectedProjectId}
          />
        ))}

        <Divider my="sm" />
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs" pb={4}>
          Session
        </Text>
        <NavLink
          component={Link}
          href="/inspect"
          label="Inspect session"
          leftSection={<IconEye size={18} />}
          active={pathname.startsWith("/inspect")}
        />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
