/**
 * Scenario 4 — 502s from a cgroup OOM kill.
 *
 * Teaching goal: the host has plenty of RAM. A deploy added a systemd drop-in
 * that caps node-app at 512M, and the hourly price sync needs more than that at
 * peak. The kernel kills the process inside its cgroup, nginx returns 502, and
 * restarting the service just repeats the cycle until the cap is lifted.
 *
 * State is real: `dmesg` says cgroup OOM, `free` says the host is fine, and the
 * restart keeps failing until the override is disabled and systemd reloads it.
 */

import type { Scenario, World } from "../engine/types";

const OVERRIDE = "/etc/systemd/system/node-app.service.d/override.conf";

const capRaised = (world: World) =>
  !(world.files[OVERRIDE] ?? "")
    .split("\n")
    .some((line) => /^\s*MemoryMax\s*=\s*512M/.test(line));

const live = (world: World) => capRaised(world) && Boolean(world.flags.daemonReloaded);

export const oom502: Scenario = {
  id: "oom-502",
  title: "No room inside the box",
  category: "linux",
  difficulty: "mid",
  parSeconds: 540,

  alert: {
    service: "api-02",
    severity: "P1",
    symptom: "checkout 502s since 03:00; node-app is in a restart loop and the host has free RAM",
    at: "03:07",
  },

  hostname: "api-02",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 02:55:18 2026 from 10.20.4.11",
  ],

  rootCauseId: "cgroup-memory-cap",
  rootCauseSummary:
    "A deploy added a systemd drop-in setting MemoryMax=512M on node-app. The hourly price sync needs roughly 700M at peak, so the kernel OOM-killed the process inside its cgroup. The host itself had plenty of free memory. nginx stayed up and returned 502 because its upstream was gone.",
  options: [
    {
      id: "cgroup-memory-cap",
      label: "A 512M cgroup limit added by a deploy makes the kernel kill node-app at peak",
      detail: "dmesg shows a cgroup OOM kill while the host still has gigabytes free.",
    },
    {
      id: "host-ram-exhausted",
      label: "The host ran out of physical memory and the global OOM killer fired",
      detail: "Would show almost no free memory and a system-wide OOM message, not a cgroup one.",
    },
    {
      id: "bad-upstream-port",
      label: "A deploy changed the nginx upstream port, so 502s come from a connection refusal",
      detail: "Would log 'Connection refused', not a process killed with signal 9.",
    },
    {
      id: "app-exception",
      label: "node-app crashed on an uncaught exception in the new release",
      detail: "Would show a JavaScript stack trace and exit code 1, not SIGKILL.",
    },
  ],

  goodSteps: [
    {
      id: "reproduce-502",
      label: "Reproduce the 502 through nginx",
      command: "curl -I http://localhost/checkout",
      match: /^curl\b.*localhost\/(checkout)?/,
      weight: 2,
    },
    {
      id: "service-state",
      label: "Check whether the upstream is running",
      command: "systemctl status node-app",
      match: /^systemctl\s+(status|is-active)\s+node-app/,
      weight: 1,
    },
    {
      id: "journal",
      label: "Read the journal and find signal 9",
      command: "journalctl -u node-app -n 40",
      match: /^journalctl\b.*node-app/,
      weight: 2,
    },
    {
      id: "free",
      label: "Rule out host memory pressure",
      command: "free -m",
      match: /^free\b/,
      weight: 2,
    },
    {
      id: "dmesg",
      label: "Read the kernel log for the OOM kill",
      command: "dmesg -T | grep -i oom",
      match: /^dmesg\b/,
      weight: 2,
    },
    {
      id: "unit-files",
      label: "Inspect the unit and its drop-ins",
      command: "systemctl cat node-app",
      match: /^systemctl\s+cat\s+node-app/,
      weight: 2,
    },
    {
      id: "memory-limit",
      label: "Read the effective memory limit",
      command: "systemctl show node-app -p MemoryMax",
      match: /^systemctl\s+show\s+node-app\b/,
      weight: 1,
    },
    {
      id: "raise-cap",
      label: "Disable the 512M drop-in",
      command: "sed -i 's/^MemoryMax=512M/#MemoryMax=512M/' /etc/systemd/system/node-app.service.d/override.conf",
      match: /^sed\s+-i\b.*override\.conf/,
      weight: 3,
    },
    {
      id: "daemon-reload",
      label: "Make systemd re-read the unit",
      command: "systemctl daemon-reload",
      match: /^systemctl\s+daemon-reload/,
      weight: 2,
    },
    {
      id: "restart",
      label: "Restart the upstream under the corrected limit",
      command: "systemctl restart node-app",
      match: /^systemctl\s+(restart|start)\s+node-app/,
      weight: 2,
    },
    {
      id: "verify",
      label: "Verify the health endpoint",
      command: "curl -I http://localhost:3000/health",
      match: /^curl\b.*(3000|health)/,
      weight: 1,
    },
  ],

  badActions: [
    {
      id: "restart-nginx",
      label: "Restarted nginx before checking the upstream",
      pattern: /^systemctl\s+restart\s+nginx/,
      penalty: 5,
      why: "nginx is doing its job: it reports 502 because the upstream is dead. Restarting it changes nothing.",
    },
    {
      id: "reboot",
      label: "Rebooted the host",
      pattern: /^(reboot|shutdown|init\s+6)/,
      penalty: 12,
      why: "The drop-in persists across reboots, so the OOM loop starts again during the next price sync.",
    },
    {
      id: "mask-service",
      label: "Masked the failing service",
      pattern: /^systemctl\s+mask\s+node-app/,
      penalty: 15,
      why: "Masking turns a restart loop into a guaranteed outage and hides the signal you need.",
    },
  ],

  hint: "The host has free RAM, so look at the process boundary: `dmesg` for a cgroup OOM, then `systemctl cat node-app` for the drop-in that set MemoryMax.",

  files: {
    "/etc/systemd/system/node-app.service": [
      "[Unit]",
      "Description=Checkout API",
      "After=network.target",
      "",
      "[Service]",
      "Type=simple",
      "User=app",
      "WorkingDirectory=/opt/app",
      "ExecStart=/usr/bin/node server.js",
      "Environment=NODE_ENV=production",
      "MemoryMax=1G",
      "Restart=always",
      "RestartSec=2",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
    ].join("\n"),

    [OVERRIDE]: [
      "# added by deploy-bot 2026-10-30 22:41",
      "# ticket OPS-8871: reduce checkout memory footprint",
      "[Service]",
      "MemoryMax=512M",
    ].join("\n"),

    "/opt/app/server.js": [
      "const express = require('express');",
      "const { runPriceSync } = require('./price-sync');",
      "const app = express();",
      "",
      "app.get('/health', (_req, res) => res.json({ status: 'ok' }));",
      "setInterval(runPriceSync, 60 * 60 * 1000);",
      "app.listen(3000, () => console.log('listening on :3000'));",
    ].join("\n"),

    "/opt/app/price-sync.js": [
      "// Loads the full supplier catalogue into memory, then diffs it.",
      "// Peak working set on production data: ~700 MB.",
      "async function runPriceSync() {",
      "  const rows = await loadAllSupplierRows();",
      "  const bySku = new Map(rows.map((row) => [row.sku, row]));",
      "  await applyDiffs(bySku);",
      "}",
      "module.exports = { runPriceSync };",
    ].join("\n"),

    "/var/log/node-app/app.log": [
      "2026-10-31T02:59:58.114Z info  price sync started",
      "2026-10-31T02:59:59.902Z info  loaded 1842003 supplier rows",
      "2026-10-31T03:00:02.331Z info  heap used 698 MB",
      "2026-10-31T03:00:02.884Z warn  process received SIGKILL",
    ].join("\n"),

    "/var/log/syslog": [
      "Oct 31 03:00:02 api-02 kernel: [41221.114] Memory cgroup out of memory: Killed process 3311 (node) total-vm:1628440kB, anon-rss:702344kB, file-rss:8192kB",
      "Oct 31 03:00:02 api-02 systemd[1]: node-app.service: Main process exited, code=killed, status=9/KILL",
      "Oct 31 03:00:04 api-02 systemd[1]: node-app.service: Scheduled restart job, restart counter is at 9.",
      "Oct 31 03:00:04 api-02 systemd[1]: node-app.service: Start request repeated too quickly.",
    ].join("\n"),

    "/etc/nginx/sites-enabled/checkout": [
      "server {",
      "  listen 80;",
      "  server_name api-02;",
      "",
      "  location / {",
      "    proxy_pass http://127.0.0.1:3000;",
      "    proxy_connect_timeout 2s;",
      "  }",
      "}",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 80;
    world.diskUsedGb = 26.4;
    world.memTotalMb = 7936;
    // Plenty free: this is a cgroup limit, not host pressure.
    world.memUsedMb = 3020;

    world.services = {
      nginx: {
        name: "nginx",
        active: true,
        description: "A high performance web server and a reverse proxy server",
        log: [
          "Started nginx - high performance web server.",
          "[error] connect() failed (111: Connection refused) while connecting to upstream 127.0.0.1:3000",
        ].join("\n"),
      },
      "node-app": {
        name: "node-app",
        active: false,
        description: "Checkout API",
        log: [
          "Started Checkout API.",
          "price sync started",
          "loaded 1842003 supplier rows, heap used 698 MB",
          "node-app.service: Main process exited, code=killed, status=9/KILL",
          "node-app.service: Scheduled restart job, restart counter is at 9.",
          "node-app.service: Start request repeated too quickly.",
        ].join("\n"),
      },
      sshd: { name: "sshd", active: true, description: "OpenBSD Secure Shell server", log: "Server listening on 0.0.0.0 port 22." },
      cron: { name: "cron", active: true, description: "Regular background program processing daemon", log: "session opened for user root" },
    };

    world.ports = [
      { proto: "tcp", local: "0.0.0.0:22", process: "sshd" },
      { proto: "tcp", local: "0.0.0.0:80", process: "nginx" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 1180, user: "www-data", cpu: 0.4, mem: 0.6, command: "nginx: worker process" },
    ];
  },

  rules: [
    {
      pattern: /^curl\b.*localhost\/checkout/,
      output: (ctx) =>
        ctx.world.services["node-app"]?.active
          ? ["HTTP/1.1 200 OK", "Content-Type: application/json", "", "{\"status\":\"ok\"}"].join("\n")
          : ["HTTP/1.1 502 Bad Gateway", "Server: nginx/1.24.0", "Content-Type: text/html", "", "<center><h1>502 Bad Gateway</h1></center>"].join("\n"),
    },

    {
      pattern: /^curl\b.*(3000|health)/,
      output: (ctx) =>
        ctx.world.services["node-app"]?.active
          ? ["HTTP/1.1 200 OK", "Content-Type: application/json", "", "{\"status\":\"ok\"}"].join("\n")
          : "curl: (7) Failed to connect to localhost port 3000 after 0 ms: Connection refused",
    },

    {
      pattern: /^dmesg\b/,
      output: [
        "[Thu Oct 31 03:00:02 2026] Memory cgroup out of memory: Killed process 3311 (node) total-vm:1628440kB, anon-rss:702344kB, file-rss:8192kB, shmem-rss:0kB",
        "[Thu Oct 31 03:00:02 2026] oom_reaper: reaped process 3311 (node), now anon-rss:0kB",
        "[Thu Oct 31 03:00:04 2026] node[3388]: cgroup memory limit 536870912 bytes reached",
      ].join("\n"),
    },

    {
      pattern: /^systemctl\s+cat\s+node-app$/,
      output: [
        "# /etc/systemd/system/node-app.service",
        "[Unit]",
        "Description=Checkout API",
        "After=network.target",
        "",
        "[Service]",
        "Type=simple",
        "User=app",
        "WorkingDirectory=/opt/app",
        "ExecStart=/usr/bin/node server.js",
        "MemoryMax=1G",
        "Restart=always",
        "",
        "# /etc/systemd/system/node-app.service.d/override.conf",
        "[Service]",
        "MemoryMax=512M",
      ].join("\n"),
    },

    {
      pattern: /^systemctl\s+show\s+node-app\b/,
      output: (ctx) => {
        const bytes = live(ctx.world) ? 1073741824 : 536870912;
        return `MemoryMax=${bytes}`;
      },
    },

    {
      pattern: /^systemctl\s+daemon-reload$/,
      output: "",
      mutate: (world) => {
        // systemd snapshots the unit at reload time. Reloading before the file
        // is fixed leaves the old 512M limit in memory.
        world.flags.daemonReloaded = capRaised(world);
      },
    },

    {
      pattern: /^systemctl\s+(restart|start)\s+node-app$/,
      when: (world) => !capRaised(world) || !world.flags.daemonReloaded,
      output: (ctx) =>
        [
          "Job for node-app.service failed because a fatal signal was delivered to the control process.",
          "See \"systemctl status node-app.service\" and \"journalctl -xeu node-app.service\" for details.",
          "",
          capRaised(ctx.world)
            ? "(the drop-in is disabled on disk, but systemd has not reloaded the unit yet)"
            : "(MemoryMax=512M is still set in the drop-in — comment it out before restarting)",
        ].join("\n"),
      asError: true,
    },
    {
      pattern: /^systemctl\s+(restart|start)\s+node-app$/,
      when: (world) => capRaised(world) && Boolean(world.flags.daemonReloaded),
      output: "Job for node-app.service completed successfully.",
      mutate: (world) => {
        const service = world.services["node-app"];
        if (service) service.active = true;
        world.flags.appRestarted = true;
        if (!world.ports.some((port) => port.local.endsWith(":3000"))) {
          world.ports.push({ proto: "tcp", local: "127.0.0.1:3000", process: "node" });
        }
        if (service) {
          service.log = [
            "Started Checkout API.",
            "listening on :3000",
            "cgroup memory limit 1073741824 bytes",
            "price sync started",
          ].join("\n");
        }
      },
    },
  ],

  isFixed: (world) => live(world) && Boolean(world.services["node-app"]?.active),

  seniorReplay: [
    "curl -I http://localhost/checkout",
    "journalctl -u node-app -n 40",
    "free -m",
    "dmesg -T | grep -i oom",
    "systemctl cat node-app",
    "systemctl show node-app -p MemoryMax",
    "sed -i 's/^MemoryMax=512M/#MemoryMax=512M/' /etc/systemd/system/node-app.service.d/override.conf",
    "systemctl daemon-reload",
    "systemctl restart node-app",
    "curl -I http://localhost/checkout",
  ],

  debrief: {
    whatHappened:
      "A deploy on 30 October added a systemd drop-in that pinned node-app to 512M of memory, intending to keep the checkout API small. The hourly price sync loads the full supplier catalogue into a Map before diffing it; on production data that peaks around 700M. At 03:00 the process crossed 512M, the kernel OOM-killer fired inside the service's cgroup, and systemd recorded SIGKILL. It restarted immediately, the sync resumed, and the loop repeated until the start-rate limiter kicked in. nginx was healthy and returned 502 for every request because nothing was listening on 3000. `free -m` showed several gigabytes available the whole time — the constraint was the cgroup, not the host.",
    howToFix:
      "Raise the cap and make systemd notice it. Comment out MemoryMax in the drop-in (or raise it to 1G), run `systemctl daemon-reload`, then restart node-app. The daemon-reload is the step people forget: the unit file changes on disk, but the running manager keeps the old limit until it re-reads the unit. Then verify with `systemctl show -p MemoryMax` and a real request through nginx. Longer term, bound the price-sync working set (stream the rows, chunk the diff) so the service does not need 700M of headroom to do its job.",
    prevention:
      "Review resource-limit changes as production changes, not housekeeping: a 512M cap on a service that already peaks at 700M is an outage waiting for the hourly job. Alert on cgroup OOM kills separately from host OOM, and add a memory headroom check to the deploy pipeline. Load-test the price sync with production-sized data after any resource change.",
  },
};
