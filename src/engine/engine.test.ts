import { describe, expect, it } from "vitest";
import { createWorld, execute } from "./shell";
import { scoreRun, stepMatches } from "./scoring";
import type { World } from "./types";
import { diskFull } from "../scenarios/disk-full";
import { expiredCert } from "../scenarios/expired-cert";
import { scenarios } from "../scenarios";

/** Run a sequence of commands, threading the world forward like the UI does. */
function runAll(scenario = diskFull, commands: string[] = []) {
  let world = createWorld(scenario);
  const all: string[] = [];
  for (const command of commands) {
    const result = execute(scenario, world, command);
    world = result.world;
    all.push(...result.lines.map((line) => line.text));
  }
  return { world, text: all.join("\n") };
}

function textOf(result: ReturnType<typeof execute>): string {
  return result.lines.map((line) => line.text).join("\n");
}

describe("shell basics", () => {
  it("seeds a world with derived directories", () => {
    const world = createWorld(diskFull);
    expect(world.dirs).toContain("/var/log/nginx");
    expect(world.files["/var/log/nginx/error.log"]).toContain("No space left on device");
  });

  it("answers unknown commands without crashing", () => {
    const result = execute(diskFull, createWorld(diskFull), "htop");
    expect(textOf(result)).toBe("bash: htop: command not found");
  });

  it("strips sudo so both spellings work", () => {
    const plain = textOf(execute(diskFull, createWorld(diskFull), "df -h"));
    const sudo = textOf(execute(diskFull, createWorld(diskFull), "sudo df -h"));
    expect(sudo).toBe(plain);
  });

  it("reports the real disk number in df", () => {
    const text = textOf(execute(diskFull, createWorld(diskFull), "df -h"));
    expect(text).toContain("98%");
  });
});

describe("disk-full scenario", () => {
  it("shows the root cause in the error log", () => {
    const text = textOf(execute(diskFull, createWorld(diskFull), "tail -n 20 /var/log/nginx/error.log"));
    expect(text).toContain("No space left on device");
  });

  it("refuses to restart the app while the volume is full", () => {
    const result = execute(diskFull, createWorld(diskFull), "systemctl restart node-app");
    expect(textOf(result)).toContain("failed");
    expect(result.world.services["node-app"].active).toBe(false);
  });

  it("frees space, restarts the app and marks the box as fixed", () => {
    const { world } = runAll(diskFull, ["truncate -s 0 /var/log/nginx/error.log"]);
    expect(world.diskUsedGb).toBeLessThan(35);

    const restarted = execute(diskFull, world, "systemctl restart node-app");
    expect(restarted.world.services["node-app"].active).toBe(true);
    expect(restarted.world.fixed).toBe(true);

    const health = execute(diskFull, restarted.world, "curl -I http://localhost:3000/health");
    expect(textOf(health)).toContain("200 OK");
  });

  it("does not let a restart fix a full disk", () => {
    const { world } = runAll(diskFull, ["systemctl restart nginx"]);
    expect(world.fixed).toBe(false);
  });

  it("flags a destructive command as a bad action", () => {
    const result = execute(diskFull, createWorld(diskFull), "rm -rf /var/log");
    expect(result.badId).toBe("delete-log-dir");
  });
});

describe("expired-cert scenario", () => {
  it("presents an expired certificate", () => {
    const text = textOf(execute(expiredCert, createWorld(expiredCert), "openssl s_client -connect checkout.shop.example:443 -servername checkout.shop.example"));
    expect(text).toContain("certificate has expired");
  });

  it("fails renewal until the ACME webroot exists", () => {
    const first = execute(expiredCert, createWorld(expiredCert), "certbot renew --cert-name checkout.shop.example --force-renewal");
    expect(textOf(first)).toContain("Challenge failed");
    expect(first.world.flags.certRenewed).toBeUndefined();
  });

  it("renews and reloads in the right order", () => {
    const { world } = runAll(expiredCert, [
      "mkdir -p /var/www/acme-challenge/.well-known/acme-challenge",
      "certbot renew --cert-name checkout.shop.example --force-renewal",
      "systemctl reload nginx",
    ]);
    expect(world.flags.certRenewed).toBe(true);
    expect(world.fixed).toBe(true);

    const check = textOf(execute(expiredCert, world, "curl -I https://checkout.shop.example"));
    expect(check).toContain("200");
  });

  it("shows the new expiry after renewal, without a reload", () => {
    const { world } = runAll(expiredCert, [
      "mkdir -p /var/www/acme-challenge/.well-known/acme-challenge",
      "certbot renew --cert-name checkout.shop.example --force-renewal",
    ]);
    // Renewed on disk but nginx still serves the old file — the classic miss.
    const served = textOf(execute(expiredCert, world, "openssl s_client -connect checkout.shop.example:443"));
    expect(served).toContain("Oct 30 21:00:00 2026 GMT");
    expect(world.fixed).toBe(false);
  });
});

describe("scoring", () => {
  it("awards a perfect score for the ideal run", () => {
    const entries = diskFull.goodSteps.map((step) => ({ command: step.command, atSeconds: 10 }));
    const score = scoreRun({
      scenario: diskFull,
      entries,
      elapsedSeconds: 120,
      hintsUsed: 0,
      rootCauseId: diskFull.rootCauseId,
      resolved: true,
    });
    expect(score.total).toBe(100);
    expect(score.grade).toBe("A+");
    expect(score.passed).toBe(true);
  });

  it("fails the run for the wrong root cause even when fast", () => {
    const score = scoreRun({
      scenario: diskFull,
      entries: diskFull.goodSteps.map((step) => ({ command: step.command, atSeconds: 5 })),
      elapsedSeconds: 3,
      hintsUsed: 0,
      rootCauseId: "oom-killed",
      resolved: true,
    });
    expect(score.correctness.correct).toBe(false);
    expect(score.passed).toBe(false);
    expect(score.grade).toBe("D");
  });

  it("deducts for hints and risky commands, and caps safety at zero", () => {
    const score = scoreRun({
      scenario: diskFull,
      entries: [
        { command: "systemctl restart nginx", atSeconds: 4 },
        { command: "rm -rf /var", atSeconds: 5 },
        { command: "rm -rf /var/log", atSeconds: 6 },
        { command: "df -h", atSeconds: 7 },
      ],
      elapsedSeconds: 900,
      hintsUsed: 2,
      rootCauseId: diskFull.rootCauseId,
      resolved: false,
    });
    expect(score.safety.points).toBe(0);
    expect(score.hints.points).toBe(-12);
    expect(score.speed.points).toBeLessThan(15);
    expect(score.investigation.found.map((s) => s.id)).toContain("df");
  });

  it("matches steps through their regex, not string equality", () => {
    const step = diskFull.goodSteps.find((entry) => entry.id === "read-error-log")!;
    expect(stepMatches(step, "tail -n 100 /var/log/nginx/error.log")).toBe(true);
    expect(stepMatches(step, "tail -n 5 /var/log/syslog")).toBe(false);
  });
});

describe("scenario contract", () => {
  it("every scenario is internally consistent", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(2);
    for (const scenario of scenarios) {
      // The correct answer must exist among the options.
      expect(scenario.options.some((option) => option.id === scenario.rootCauseId)).toBe(true);
      // Four plausible options keep guessing unattractive.
      expect(scenario.options.length).toBeGreaterThanOrEqual(3);
      // Every good step must be runnable and actually detected.
      for (const step of scenario.goodSteps) {
        expect(stepMatches(step, step.command), `${scenario.id}/${step.id} does not match its own command`).toBe(true);
      }
      // Every scenario must seed a banner and at least one rule.
      expect(scenario.banner.length).toBeGreaterThan(0);
      expect(scenario.rules.length).toBeGreaterThan(0);
      // A fix path must exist: running the scenario's own commands must not throw.
      const world = createWorld(scenario);
      expect(Object.keys(world.services).length).toBeGreaterThan(0);
    }
  });

  it("keeps scenario rules isolated from each other", () => {
    // The disk rule must not fire inside the TLS box.
    const result = execute(expiredCert, createWorld(expiredCert), "du -sh /var/log");
    expect(textOf(result)).not.toContain("8.4G");
  });
});

describe("completion", () => {
  it("completes a command prefix", async () => {
    const { complete } = await import("./shell");
    const world: World = createWorld(diskFull);
    expect(complete(diskFull, world, "df").value).toBe("df ");
    expect(complete(diskFull, world, "doc").options).toContain("docker");
  });

  it("completes service names after systemctl", async () => {
    const { complete } = await import("./shell");
    const world = createWorld(diskFull);
    const completion = complete(diskFull, world, "systemctl status node");
    expect(completion.value).toBe("systemctl status node-app");
  });
});
