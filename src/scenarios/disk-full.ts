/**
 * Scenario 1 — Disk full.
 *
 * Teaching goal: ENOSPC is a storage problem, not a service problem. Restarting
 * nginx cannot free a full volume, and doing it first destroys the evidence.
 *
 * State is real: `df` reads world.diskUsedGb, and the cleanup commands actually
 * lower it. `systemctl restart node-app` fails while the disk is full and
 * succeeds once it is not — no special-casing in the shell.
 */

import type { Scenario } from "../engine/types";

const TOTAL_GB = 40;
const FULL_GB = 39.2;
const FIXED_GB = 30.4;

/** Anything under 85% counts as "we got the volume back". */
const freedEnough = (used: number) => used / TOTAL_GB < 0.85;

export const diskFull: Scenario = {
  id: "disk-full",
  title: "The volume is full",
  category: "linux",
  difficulty: "junior",
  parSeconds: 420,

  alert: {
    service: "web-03",
    severity: "P1",
    symptom: "502s spiking on /checkout, latency up 10x",
    at: "03:04",
  },

  hostname: "web-03",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 02:41:07 2026 from 10.20.4.11",
    "You have new mail.",
  ],

  rootCauseId: "log-volume-full",
  rootCauseSummary:
    "The root volume hit 98% because nginx logs were never rotated. Writes fail with ENOSPC, node-app crashed, and nginx returns 502 because its upstream is gone.",
  options: [
    {
      id: "log-volume-full",
      label: "The root volume is full; node-app died on ENOSPC and nginx has no upstream",
      detail: "Storage exhaustion caused by unrotated logs in /var/log/nginx.",
    },
    {
      id: "worker-exhaustion",
      label: "nginx ran out of worker connections and started refusing traffic",
      detail: "Would show 'worker_connections are not enough' in the error log.",
    },
    {
      id: "bad-upstream-port",
      label: "A deploy changed the upstream port, so nginx cannot reach node-app",
      detail: "Would show 'connect() failed ... Connection refused' with a wrong port.",
    },
    {
      id: "oom-killed",
      label: "The kernel OOM killer stopped node-app because RAM is exhausted",
      detail: "Would show 'Out of memory: Killed process' in dmesg.",
    },
  ],

  goodSteps: [
    {
      id: "df",
      label: "Check free space before touching anything",
      command: "df -h",
      match: /^df\b/,
      weight: 2,
    },
    {
      id: "du-log",
      label: "Find which directory is actually eating the disk",
      command: "du -sh /var/log",
      match: /^du\s+.*\/var\/log$/,
      weight: 2,
    },
    {
      id: "list-nginx-logs",
      label: "Confirm a single runaway log file",
      command: "ls -lh /var/log/nginx",
      match: /^ls\s+-l.*\/var\/log\/nginx/,
      weight: 1,
    },
    {
      id: "read-error-log",
      label: "Read the error log for the real failure",
      command: "tail -n 20 /var/log/nginx/error.log",
      match: /^(tail|cat|grep|less|head).*error\.log/,
      weight: 2,
    },
    {
      id: "service-state",
      label: "Check service state instead of guessing",
      command: "systemctl status node-app",
      match: /^systemctl\s+(status|is-active)\s+node-app/,
      weight: 1,
    },
    {
      id: "app-journal",
      label: "Read the app journal to link ENOSPC to the crash",
      command: "journalctl -u node-app -n 20",
      match: /^journalctl\s+.*node-app/,
      weight: 1,
    },
    {
      id: "free-space",
      label: "Truncate or remove the runaway logs",
      command: "truncate -s 0 /var/log/nginx/error.log",
      match: /^(truncate\s+-s\s+0|rm\s+-f?r?f?\s+\/var\/log\/nginx\/(error|access)\.log)/,
      weight: 3,
    },
    {
      id: "restart-app",
      label: "Restart the upstream once there is room to write",
      command: "systemctl restart node-app",
      match: /^systemctl\s+(restart|start)\s+node-app/,
      weight: 1,
    },
    {
      id: "verify",
      label: "Verify recovery from the outside",
      command: "curl -I http://localhost:3000/health",
      match: /^curl\s+.*(3000|checkout)/,
      weight: 2,
    },
  ],

  badActions: [
    {
      id: "restart-nginx-first",
      label: "Restarted nginx before looking at storage",
      pattern: /^systemctl\s+restart\s+nginx/,
      penalty: 5,
      why: "nginx was already running. A restart cannot free a full disk, and it throws away the log that names the error.",
    },
    {
      id: "delete-log-dir",
      label: "Deleted the whole log directory",
      pattern: /^rm\s+-[rf]*\s+\/var\/log\s*$/,
      penalty: 12,
      why: "You lose audit and debugging history, and systemd has open handles on files you just unlinked.",
    },
    {
      id: "rm-root",
      label: "Ran rm against a system path",
      pattern: /^rm\s+-[rf]+\s+\/(var|usr|etc|)\s*$/,
      penalty: 15,
      why: "This is how you turn a disk alert into a rebuild.",
    },
    {
      id: "reboot",
      label: "Rebooted the host",
      pattern: /^(reboot|shutdown|init\s+6)/,
      penalty: 12,
      why: "A reboot clears nothing on a full disk and takes the incident from P1 to a longer P1.",
    },
  ],

  hint: "Start with the filesystem, not the service. `df -h`, then `du -sh /var/log`, then look inside /var/log/nginx.",

  files: {
    "/var/log/nginx/error.log": [
      "2026/10/31 02:58:02 [error] 1204#1204: *8814 connect() failed (111: Connection refused) while connecting to upstream, client: 41.58.22.10, server: web-03, request: \"POST /checkout HTTP/1.1\", upstream: \"http://127.0.0.1:3000/checkout\"",
      "2026/10/31 02:59:44 [error] 1204#1204: *8820 connect() failed (111: Connection refused) while connecting to upstream, client: 102.89.14.77, server: web-03, request: \"POST /checkout HTTP/1.1\", upstream: \"http://127.0.0.1:3000/checkout\"",
      "2026/10/31 03:00:11 [crit] 1204#1204: *8821 write() to \"/var/log/nginx/access.log\" failed (28: No space left on device)",
      "2026/10/31 03:00:11 [error] 1204#1204: *8821 open() \"/var/log/nginx/error.log\" failed (28: No space left on device)",
      "2026/10/31 03:01:37 [error] 1204#1204: *8830 connect() failed (111: Connection refused) while connecting to upstream, client: 197.210.44.8, server: web-03, request: \"POST /checkout HTTP/1.1\", upstream: \"http://127.0.0.1:3000/checkout\"",
      "2026/10/31 03:02:11 [crit] 1204#1204: *8841 write() to \"/var/log/nginx/access.log\" failed (28: No space left on device)",
    ].join("\n"),

    "/var/log/nginx/access.log": [
      "41.58.22.10 - - [31/Oct/2026:02:58:02 +0000] \"POST /checkout HTTP/1.1\" 502 157 \"-\" \"Mozilla/5.0\"",
      "102.89.14.77 - - [31/Oct/2026:02:59:44 +0000] \"POST /checkout HTTP/1.1\" 502 157 \"-\" \"Mozilla/5.0\"",
      "197.210.44.8 - - [31/Oct/2026:03:01:37 +0000] \"GET /health HTTP/1.1\" 502 157 \"-\" \"kube-probe/1.29\"",
    ].join("\n"),

    "/var/log/nginx/access.log.1.gz": "(binary gzip stream, 1.1G)",
    "/var/log/nginx/error.log.1.gz": "(binary gzip stream, 900M)",
    "/var/log/nginx/access.log.2.gz": "(binary gzip stream, 1.0G)",
    "/var/log/nginx/error.log.2.gz": "(binary gzip stream, 780M)",

    "/var/log/node-app/app.log": [
      "2026-10-31T02:57:41.221Z info  server listening on :3000",
      "2026-10-31T02:58:00.918Z error Error: ENOSPC: no space left on device, write",
      "    at Object.writeSync (node:fs:935:3)",
      "    at Object.writeFileSync (node:fs:2350:3)",
      "    at SessionStore.persist (/opt/app/session-store.js:44:9)",
      "2026-10-31T02:58:01.004Z error uncaught exception, exiting",
    ].join("\n"),

    "/var/log/node-app/app.log.1": "2026-10-31T01:00:02.114Z info  hourly session sweep complete",
    "/var/log/syslog": [
      "Oct 31 02:58:01 web-03 systemd[1]: node-app.service: Main process exited, code=exited, status=1/FAILURE",
      "Oct 31 02:58:01 web-03 systemd[1]: node-app.service: Failed with result 'exit-code'.",
      "Oct 31 02:58:32 web-03 systemd[1]: node-app.service: Scheduled restart job, restart counter is at 5.",
      "Oct 31 02:58:32 web-03 systemd[1]: node-app.service: Start request repeated too quickly.",
      "Oct 31 02:58:32 web-03 systemd[1]: node-app.service: Failed with result 'exit-code'.",
    ].join("\n"),

    "/etc/nginx/nginx.conf": [
      "user www-data;",
      "worker_processes auto;",
      "pid /run/nginx.pid;",
      "",
      "events { worker_connections 768; }",
      "",
      "http {",
      "  access_log /var/log/nginx/access.log;",
      "  error_log  /var/log/nginx/error.log;",
      "  include /etc/nginx/sites-enabled/*;",
      "}",
    ].join("\n"),

    "/etc/nginx/sites-enabled/checkout": [
      "server {",
      "  listen 80;",
      "  server_name web-03;",
      "",
      "  location / {",
      "    proxy_pass http://127.0.0.1:3000;",
      "    proxy_set_header Host $host;",
      "    proxy_connect_timeout 2s;",
      "  }",
      "}",
    ].join("\n"),

    "/opt/app/server.js": "const app = require('./app');\napp.listen(3000);\n",
    "/opt/app/session-store.js": "// persist() writes to /var/lib/node-app/sessions on every request\nmodule.exports = {};\n",
    "/etc/logrotate.d/nginx": "# logrotate is installed but the timer is masked on this host\n/var/log/nginx/*.log {\n  daily\n  rotate 14\n}\n",
  },

  seed: (world) => {
    world.diskTotalGb = TOTAL_GB;
    world.diskUsedGb = FULL_GB;
    world.memTotalMb = 7936;
    world.memUsedMb = 2310;

    world.services = {
      nginx: {
        name: "nginx",
        active: true,
        description: "A high performance web server and a reverse proxy server",
        log: [
          "Started nginx - high performance web server.",
          "signal process started",
          "[crit] write() to \"/var/log/nginx/access.log\" failed (28: No space left on device)",
        ].join("\n"),
      },
      "node-app": {
        name: "node-app",
        active: false,
        description: "SimplyFly checkout API",
        log: [
          "Started SimplyFly checkout API.",
          "Error: ENOSPC: no space left on device, write",
          "uncaught exception, exiting",
          "Start request repeated too quickly.",
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
      { pid: 1204, user: "www-data", cpu: 0.4, mem: 0.6, command: "nginx: worker process" },
      { pid: 1201, user: "root", cpu: 0.1, mem: 0.3, command: "nginx: master process /usr/sbin/nginx" },
    ];
  },

  rules: [
    /* --- storage, curated so the numbers are believable ------------- */
    {
      pattern: /^du\s+-s.*\/var\/log$/,
      output: "8.4G\t/var/log",
    },
    {
      pattern: /^du\s+-s.*\/var\/log\/nginx$/,
      output: "8.2G\t/var/log/nginx",
    },
    {
      pattern: /^ls\s+-l.*\/var\/log$/,
      output: [
        "total 8421372",
        "drwxr-xr-x 2 www-data www-data       4096 Oct 31 02:12 nginx",
        "drwxr-xr-x 2 root     root           4096 Oct 30 12:00 node-app",
        "-rw-r----- 1 root     adm        182042 Oct 31 03:00 syslog",
      ].join("\n"),
    },
    {
      pattern: /^ls\s+-l.*\/var\/log\/nginx/,
      output: [
        "total 8601600",
        "-rw-r--r-- 1 www-data www-data 8803602432 Oct 31 03:02 error.log",
        "-rw-r--r-- 1 www-data www-data   11843712 Oct 31 03:02 access.log",
        "-rw-r--r-- 1 root     root       900000000 Oct 24 00:00 error.log.1.gz",
        "-rw-r--r-- 1 root     root      1100000000 Oct 17 00:00 access.log.1.gz",
      ].join("\n"),
    },

    /* --- cleanup: the only commands that actually free the volume --- */
    {
      pattern: /^truncate\s+-s\s+0\s+\/var\/log\/nginx\/(error|access)\.log$/,
      output: "",
      mutate: (world) => {
        world.diskUsedGb = FIXED_GB;
        world.flags.capacityFreed = true;
      },
    },
    {
      pattern: /^rm\s+-f?\s*\/var\/log\/nginx\/\*\.gz$/,
      output: "",
      mutate: (world) => {
        for (const name of ["access.log.1.gz", "error.log.1.gz", "access.log.2.gz", "error.log.2.gz"]) {
          delete world.files[`/var/log/nginx/${name}`];
        }
        world.diskUsedGb = FIXED_GB;
        world.flags.capacityFreed = true;
      },
    },
    {
      pattern: /^journalctl\s+--vacuum-size=\d+[MG]$/,
      output: "Vacuuming done, freed 612M of archived journals from /var/log/journal.",
      mutate: (world) => {
        // Realistic: vacuuming journals is not enough on its own.
        world.diskUsedGb = Math.min(world.diskUsedGb, 38.6);
        world.flags.journalVacuumed = true;
      },
    },

    /* --- the restart that fails while the disk is still full -------- */
    {
      pattern: /^systemctl\s+(restart|start)\s+node-app$/,
      when: (world) => !freedEnough(world.diskUsedGb),
      output: [
        "Job for node-app.service failed because the control process exited with error code.",
        "See \"systemctl status node-app.service\" and \"journalctl -xeu node-app.service\" for details.",
      ].join("\n"),
      asError: true,
    },
    {
      pattern: /^systemctl\s+(restart|start)\s+node-app$/,
      when: (world) => freedEnough(world.diskUsedGb),
      output: "Job for node-app.service completed successfully.",
      mutate: (world) => {
        const service = world.services["node-app"];
        if (service) service.active = true;
        world.flags.appRestarted = true;
        if (!world.ports.some((port) => port.local.endsWith(":3000"))) {
          world.ports.push({ proto: "tcp", local: "127.0.0.1:3000", process: "node" });
        }
      },
    },

    /* --- health check reflects the world, not a script -------------- */
    {
      pattern: /^curl\s+.*(3000|localhost).*\/health/,
      output: (ctx) =>
        ctx.world.services["node-app"]?.active
          ? ["HTTP/1.1 200 OK", "Content-Type: application/json", "", "{\"status\":\"ok\",\"disk\":\"ok\"}"].join("\n")
          : "curl: (7) Failed to connect to localhost port 3000 after 0 ms: Connection refused",
      asError: false,
    },
  ],

  isFixed: (world) => freedEnough(world.diskUsedGb) && Boolean(world.services["node-app"]?.active),

  seniorReplay: [
    "df -h",
    "du -sh /var/log",
    "ls -lh /var/log/nginx",
    "tail -n 20 /var/log/nginx/error.log",
    "journalctl -u node-app -n 20",
    "truncate -s 0 /var/log/nginx/error.log",
    "rm -f /var/log/nginx/*.gz",
    "systemctl restart node-app",
    "curl -I http://localhost:3000/health",
  ],

  debrief: {
    whatHappened:
      "nginx kept writing to its access and error logs, but logrotate was masked on this host, so a single error.log grew past 8GB. The root volume reached 98%. node-app writes a session file on every checkout request; the first write after the disk filled returned ENOSPC, which crashed the process. nginx stayed up, kept accepting connections, and returned 502 to every /checkout request because its upstream on 127.0.0.1:3000 was gone.",
    howToFix:
      "Free space first, then restart the upstream. Truncating the oversized log (or deleting the rotated .gz files) immediately returns about 9GB. Then restart node-app, confirm port 3000 is listening again, and check /health from the outside. Finally, stop it happening again: enable the logrotate timer, add a disk-space alert at 85%, and cap nginx logs with a size-based rotation policy.",
    prevention:
      "Alert on disk usage at 85% and on log file growth rate, not just on 95%. Unmask logrotate and test it in staging. Give /var/log its own volume so application logs cannot take down the runtime.",
  },
};
