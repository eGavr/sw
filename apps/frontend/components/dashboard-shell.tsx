"use client";

import { AppShell, Avatar, Burger, Group, Menu, NavLink, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconEye, IconFolder, IconLogout } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg">sw</Text>
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
        <NavLink
          component={Link}
          href="/projects"
          label="Projects"
          leftSection={<IconFolder size={18} />}
          active={pathname.startsWith("/projects")}
        />
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
