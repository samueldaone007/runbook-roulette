import type { Scenario, World } from "../../engine/types";

/** `ops@web-03:~$` — shortens the home directory the way a real prompt does. */
export function formatPrompt(scenario: Scenario, world: World): string {
  const home = `/home/${scenario.user}`;
  const cwd =
    world.cwd === home
      ? "~"
      : world.cwd.startsWith(`${home}/`)
        ? `~${world.cwd.slice(home.length)}`
        : world.cwd;
  return `${scenario.user}@${scenario.hostname}:${cwd}$`;
}
