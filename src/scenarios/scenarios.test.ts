import { describe, expect, it } from "vitest";
import { createWorld, execute } from "../engine/shell";
import { scenarios } from ".";
import { badDns } from "./bad-dns";
import { crashLoopEnv } from "./crashloop-env";
import { dbConnections } from "./db-connections";
import { diskFull } from "./disk-full";
import { oom502 } from "./oom-502";
import { sshLockout } from "./ssh-lockout";
import { stuckCron } from "./stuck-cron";

function textOf(result: ReturnType<typeof execute>): string {
  return result.lines.map((line) => line.text).join("\n");
}

describe("scenario replays", () => {
  it("every senior replay leaves the box healthy", () => {
    for (const scenario of scenarios) {
      let world = createWorld(scenario);
      for (const command of scenario.seniorReplay) {
        world = execute(scenario, world, command).world;
      }
      expect(world.fixed, `${scenario.id} replay did not fix the incident`).toBe(true);
    }
  });

  it("every scenario keeps the correct root cause among the options", () => {
    for (const scenario of scenarios) {
      expect(
        scenario.options.some((option) => option.id === scenario.rootCauseId),
        `${scenario.id} is missing its own root cause`,
      ).toBe(true);
    }
  });
});

describe("shell primitives used by the scenarios", () => {
  it("edits a file in place and treats ^ as a line anchor", () => {
    let world = createWorld(diskFull);
    world.files["/tmp/demo.conf"] = "alpha=1\nbeta=2\nalpha=3\n";

    const edited = execute(diskFull, world, "sed -i 's/^alpha=.*/alpha=9/' /tmp/demo.conf");
    expect(edited.world.files["/tmp/demo.conf"]).toBe("alpha=9\nbeta=2\nalpha=3\n");

    // Without -i the file is only previewed.
    const preview = execute(diskFull, edited.world, "sed 's/beta/2/' /tmp/demo.conf");
    expect(preview.world.files["/tmp/demo.conf"]).toBe("alpha=9\nbeta=2\nalpha=3\n");
    expect(textOf(preview)).toContain("2=2");
  });

  it("kills a process and complains about one that does not exist", () => {
    const world = createWorld(stuckCron);
    const killed = execute(stuckCron, world, "kill 2140");
    expect(killed.world.processes.some((process) => process.pid === 2140)).toBe(false);

    const missing = execute(stuckCron, world, "kill 999999");
    expect(textOf(missing)).toContain("No such process");
  });
});

describe("bad-dns", () => {
  it("does not let a reload before the edit count as a fix", () => {
    let world = createWorld(badDns);

    const early = execute(badDns, world, "rndc reload");
    expect(early.world.fixed).toBe(false);

    world = execute(badDns, early.world, "sed -i 's/10.0.0.99/10.0.0.12/' /etc/bind/zones/db.shop.example").world;
    expect(world.fixed).toBe(false);

    const reloaded = execute(badDns, world, "rndc reload");
    expect(reloaded.world.fixed).toBe(true);
    expect(textOf(execute(badDns, reloaded.world, "dig +short checkout.shop.example"))).toBe("10.0.0.12");
  });

  it("flags a useless nginx restart as unsafe", () => {
    const result = execute(badDns, createWorld(badDns), "systemctl restart nginx");
    expect(result.badId).toBe("restart-nginx");
  });
});

describe("oom-502", () => {
  it("keeps failing until the drop-in is fixed and reloaded", () => {
    let world = createWorld(oom502);
    world = execute(oom502, world, "systemctl daemon-reload").world;

    const stillCapped = execute(oom502, world, "systemctl restart node-app");
    expect(textOf(stillCapped)).toContain("fatal signal");
    expect(stillCapped.world.fixed).toBe(false);

    world = execute(
      oom502,
      stillCapped.world,
      "sed -i 's/^MemoryMax=512M/#MemoryMax=512M/' /etc/systemd/system/node-app.service.d/override.conf",
    ).world;
    expect(world.fixed).toBe(false);

    world = execute(oom502, world, "systemctl daemon-reload").world;
    world = execute(oom502, world, "systemctl restart node-app").world;
    expect(world.fixed).toBe(true);
    expect(world.services["node-app"]?.active).toBe(true);
  });
});

describe("crashloop-env", () => {
  it("does not report a successful rollout before the env is corrected", () => {
    const world = createWorld(crashLoopEnv);
    const early = execute(crashLoopEnv, world, "kubectl rollout status deployment/api");
    expect(textOf(early)).toContain("Waiting for deployment");
    expect(early.world.fixed).toBe(false);

    const fixed = execute(crashLoopEnv, world, "kubectl set env deployment/api DB_HOST=postgres-svc").world;
    const rolled = execute(crashLoopEnv, fixed, "kubectl rollout status deployment/api");
    expect(rolled.world.fixed).toBe(true);
    expect(rolled.world.pods.find((pod) => pod.name.startsWith("api-"))?.status).toBe("Running");
  });
});

describe("stuck-cron", () => {
  it("needs both the duplicate schedule removed and the runaways killed", () => {
    let world = createWorld(stuckCron);
    world = execute(
      stuckCron,
      world,
      "sed -i 's|^\\*/5 .*render-invoices.sh|# duplicate removed by on-call|' /etc/cron.d/reports",
    ).world;
    expect(world.fixed).toBe(false);

    world = execute(stuckCron, world, "kill 2140 2141 2142 2214").world;
    expect(world.fixed).toBe(true);
    expect(textOf(execute(stuckCron, world, "uptime"))).not.toContain("28.40");
  });
});

describe("ssh-lockout", () => {
  it("requires a reload after the allow list is corrected", () => {
    let world = createWorld(sshLockout);
    world = execute(sshLockout, world, "systemctl reload sshd").world;
    expect(world.fixed).toBe(false);

    world = execute(
      sshLockout,
      world,
      "sed -i 's/^AllowUsers deploy$/AllowUsers deploy ops/' /etc/ssh/sshd_config.d/50-hardening.conf",
    ).world;
    expect(world.fixed).toBe(false);

    world = execute(sshLockout, world, "systemctl reload sshd").world;
    expect(world.fixed).toBe(true);
    expect(textOf(execute(sshLockout, world, "ssh -o BatchMode=yes ops@127.0.0.1 true"))).toContain("accepted");
  });

  it("treats a restart as a safety mistake", () => {
    const result = execute(sshLockout, createWorld(sshLockout), "systemctl restart sshd");
    expect(result.badId).toBe("restart-sshd");
  });
});

describe("db-connections", () => {
  it("frees ordinary slots when the reporting backends are terminated", () => {
    let world = createWorld(dbConnections);
    const before = execute(dbConnections, world, 'psql -c "select count(*) from pg_stat_activity"');
    expect(textOf(before)).toContain("97");
    expect(before.world.fixed).toBe(false);

    world = execute(
      dbConnections,
      world,
      `psql -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'reporting'"`,
    ).world;
    expect(world.fixed).toBe(true);

    const after = execute(dbConnections, world, 'psql -c "select count(*) from pg_stat_activity"');
    expect(textOf(after)).toContain("16");
  });

  it("penalises a database restart as the wrong recovery", () => {
    const result = execute(dbConnections, createWorld(dbConnections), "systemctl restart postgresql");
    expect(result.badId).toBe("restart-postgres");
  });
});
