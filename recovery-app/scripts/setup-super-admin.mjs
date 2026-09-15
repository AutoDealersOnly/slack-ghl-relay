import { setUpNamedSuperAdminChannel } from "../server/relay/super-admin.ts";

try {
  const result = await setUpNamedSuperAdminChannel();
  console.log(`Super Admin setup complete. Refreshed ${result.pendingControls} pending archive control message(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Super Admin setup failed.");
  process.exitCode = 1;
}
