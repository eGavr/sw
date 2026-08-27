import { Button, Center, Paper, Stack, Text } from "@mantine/core";

import { signInAction } from "@/app/actions/auth";

export default function LoginPage() {
  return (
    <Center h="100vh">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={360}>
        <Stack align="center" gap="lg">
          <Stack align="center" gap={2}>
            <Text fw={700} fz={28}>
              sw
            </Text>
            <Text c="dimmed" size="sm">
              Sign in to continue
            </Text>
          </Stack>
          <form action={signInAction} style={{ width: "100%" }}>
            <Button type="submit" fullWidth size="md">
              Sign in with Keycloak
            </Button>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
