/**
 * Scenario 6 — The cron job that started twice.
 *
 * Teaching goal: high load is a symptom. A configuration-management run
 * appended a second schedule for the same report job, the script has no lock,
 * and every five minutes another copy starts on top of the last one. Killing
 * the processes buys you ten minutes; removing the duplicate schedule is the
 * fix.
 *
 * State is real: `ps` and `top` read world.processes, `kill` removes them, and
 * `uptime` drops once the renderers are gone. `isFixed` deliberately requires
 * both halves — one without the other is a temporary reprieve.
 */

import type { Scenario, World } from "../engine/types";

const CRON_FILE = "/etc/cron.d/reports";

const renderers = (world: World) =>
  world.processes.filter((process) => /render-invoices|render\.js|chromium/.test(process.command));

const scheduleCount = (world: World) =>
  (world.files[CRON_FILE] ?? "")
    .split("\n")
    .filter((line) => /render-invoices\.sh/.test(line) && !line.trimStart().startsWith("#")).length;

const duplicateGone = (world: World) => scheduleCount(world) <= 1;
const runawayGone = (world: World) => renderers(world).length === 0;

export const stuckCron: Scenario = {
  id: "stuck-cron",
  title: "The job that started twice",
  category: "linux",
  difficulty: "mid",
  parSeconds: 540,

  alert: {
    service: "batch-01",
    severity: "P1",
    symptom: "invoice queue is six hours behind; load average 38 and still climbing",
    at: "03:41",
  },

  hostname: "batch-01",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 03:38:11 2026 from 10.20.4.11",
    "Batch host. No customer traffic, but finance notices when invoices stop.",
  ],

  rootCauseId: "duplicate-cron-schedule",
  rootCauseSummary:
    "A configuration-management run on 30 October appended a second schedule for render-invoices.sh instead of replacing the first. The script has no lock, so the */5 copy now starts while the previous run is still rendering. Three overlapping renderers are saturating the host, and each run re-renders the same open invoices.",
  options: [
    {
      id: "duplicate-cron-schedule",
      label: "Two schedules run the same unlockable job, so every run overlaps the last",
      detail: "The cron file contains both */15 and */5, and render.log shows three starts for batch 4412.",
    },
    {
      id: "cron-daemon-hang",
      label: "The cron daemon itself is stuck and launching jobs repeatedly",
      detail: "Would show one cron process and identical log lines, not two schedules in the same file.",
    },
    {
      id: "runaway-memory",
      label: "A memory leak in the renderer is forcing the kernel to swap",
      detail: "Would show swap in use and OOM pressure; `free` shows memory is fine here.",
    },
    {
      id: "disk-io",
      label: "The invoice volume is saturated by a failing disk",
      detail: "Would show high iowait and disk errors, not three CPU-bound renderers.",
    },
  ],

  goodSteps: [
    {
      id: "cron-status",
      label: "Confirm cron itself is alive",
      command: "systemctl status cron",
      match: /^systemctl\s+status\s+cron/,
      weight: 1,
    },
    {
      id: "read-cron-file",
      label: "Read the actual schedules",
      command: "cat /etc/cron.d/reports",
      match: /^(cat|less)\s+\/etc\/cron\.d\/reports/,
      weight: 2,
    },
    {
      id: "cron-log",
      label: "See the same command start more than once",
      command: "tail -n 50 /var/log/cron.log",
      match: /^(tail|cat|less|grep)\b.*\/var\/log\/cron\.log/,
      weight: 2,
    },
    {
      id: "processes",
      label: "Find the processes pinning the CPU",
      command: "ps aux --sort=-%cpu",
      match: /^ps\b/,
      weight: 2,
    },
    {
      id: "render-log",
      label: "Read the job's own log for overlapping batches",
      command: "cat /var/log/reports/render.log",
      match: /^(cat|tail|less|grep)\b.*\/var\/log\/reports\/render\.log/,
      weight: 1,
    },
    {
      id: "read-script",
      label: "Notice the script has no lock",
      command: "cat /opt/reports/render-invoices.sh",
      match: /^(cat|less)\b.*render-invoices\.sh/,
      weight: 1,
    },
    {
      id: "remove-duplicate",
      label: "Remove the duplicate schedule",
      command: "sed -i 's|^\\*/5 .*render-invoices.sh|# duplicate removed by on-call|' /etc/cron.d/reports",
      match: /^sed\s+-i\b.*\/etc\/cron\.d\/reports/,
      weight: 3,
    },
    {
      id: "kill-overlap",
      label: "Stop the overlapping renderers",
      command: "kill 2140 2141 2142 2214",
      match: /^kill\b.*\b214\d\b/,
      weight: 3,
    },
    {
      id: "verify-load",
      label: "Confirm the load is actually coming down",
      command: "uptime",
      match: /^uptime\b/,
      weight: 1,
    },
  ],

  badActions: [
    {
      id: "restart-cron",
      label: "Restarted cron while the jobs were still running",
      pattern: /^systemctl\s+restart\s+cron/,
      penalty: 4,
      why: "Restarting the daemon does not touch running jobs, and it does not remove the duplicate schedule.",
    },
    {
      id: "stop-cron",
      label: "Stopped cron entirely",
      pattern: /^systemctl\s+stop\s+cron/,
      penalty: 12,
      why: "Every scheduled job on the host stops — invoices, backups, log rotation. That is a wider outage than the one you are fixing.",
    },
    {
      id: "delete-cron",
      label: "Deleted the cron directory",
      pattern: /^rm\s+-[rf]*\s+\/etc\/cron/,
      penalty: 15,
      why: "You deleted the schedules and the evidence, including jobs that had nothing to do with this incident.",
    },
    {
      id: "reboot",
      label: "Rebooted the batch host",
      pattern: /^(reboot|shutdown|init\s+6)/,
      penalty: 12,
      why: "The duplicate line is persisted on disk. After the reboot it starts again in five minutes, and finance has lost another window.",
    },
  ],

  hint: "Read `/etc/cron.d/reports` and `/var/log/reports/render.log`: the same script is scheduled twice and the batches overlap. Remove the duplicate line, then kill every renderer PID shown by `ps` — one without the other only buys time.",

  files: {
    [CRON_FILE]: [
      "SHELL=/bin/bash",
      "PATH=/usr/local/bin:/usr/bin:/bin",
      "",
      "# nightly invoice rendering",
      "*/15 * * * * reports /opt/reports/render-invoices.sh",
      "*/5 * * * * reports /opt/reports/render-invoices.sh",
      "",
      "# 2026-10-30 ansible: reports-cron v2.3 (line appended, old line was not removed)",
    ].join("\n"),

    "/opt/reports/render-invoices.sh": [
      "#!/bin/bash",
      "# Renders every open invoice to PDF. One Chromium process per page batch.",
      "# NOTE: deliberately no lock file — overlapping runs are possible.",
      "set -u",
      "cd /opt/reports",
      'node render.js --batch "$(date +%s)"',
      "echo \"batch complete\"",
    ].join("\n"),

    "/opt/reports/render.js": [
      "const { chromium } = require('playwright');",
      "const invoices = loadOpenInvoices(); // ~1,800 open invoices",
      "",
      "async function renderAll(batch) {",
      "  const browser = await chromium.launch();",
      "  for (const invoice of invoices) {",
      "    await renderInvoice(browser, invoice, batch);",
      "  }",
      "}",
      "",
      "renderAll(process.argv[2]);",
    ].join("\n"),

    "/var/log/cron.log": [
      "Oct 31 02:45:01 batch-01 CRON[2071]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 02:50:01 batch-01 CRON[2098]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 03:00:01 batch-01 CRON[2110]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 03:05:01 batch-01 CRON[2140]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 03:05:01 batch-01 CRON[2141]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 03:10:01 batch-01 CRON[2214]: (reports) CMD (/opt/reports/render-invoices.sh)",
      "Oct 31 03:10:01 batch-01 CRON[2215]: (reports) CMD (/opt/reports/render-invoices.sh)",
    ].join("\n"),

    "/var/log/reports/render.log": [
      "03:00:01 render-invoices start batch=4410 pid=2110",
      "03:05:01 render-invoices start batch=4411 pid=2140",
      "03:05:01 render-invoices start batch=4412 pid=2141",
      "03:05:02 warn: previous batch 4409 still running (age 21m)",
      "03:05:03 chromium renderer spawned for invoice 88102",
      "03:10:01 render-invoices start batch=4413 pid=2214",
      "03:10:02 render-invoices start batch=4414 pid=2215",
      "03:10:02 warn: previous batch 4412 still running (age 5m)",
      "03:10:04 chromium renderer spawned for invoice 88102",
    ].join("\n"),

    "/var/log/syslog": [
      "Oct 31 03:05:02 batch-01 kernel: [88211.441] CPU2: Core temperature above threshold, cpu clock throttled",
      "Oct 31 03:09:58 batch-01 systemd[1]: cron.service: Scheduled restart job, restart counter is at 0.",
      "Oct 31 03:10:02 batch-01 kernel: [88511.119] TCP: request_sock_TCP: Possible SYN flooding on port 22. Sending cookies.",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 80;
    world.diskUsedGb = 31.7;
    world.memTotalMb = 7936;
    world.memUsedMb = 5120;

    world.services = {
      cron: {
        name: "cron",
        active: true,
        description: "Regular background program processing daemon",
        log: [
          "Started cron.service - Regular background program processing daemon.",
          "(reports) CMD (/opt/reports/render-invoices.sh)",
          "(reports) CMD (/opt/reports/render-invoices.sh)",
          "(reports) CMD (/opt/reports/render-invoices.sh)",
        ].join("\n"),
      },
      sshd: {
        name: "sshd",
        active: true,
        description: "OpenBSD Secure Shell server",
        log: "Server listening on 0.0.0.0 port 22.",
      },
    };

    world.ports = [
      { proto: "tcp", local: "0.0.0.0:22", process: "sshd" },
      { proto: "tcp", local: "127.0.0.1:9100", process: "node_exporter" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 2140, user: "reports", cpu: 96.2, mem: 6.1, command: "/bin/bash /opt/reports/render-invoices.sh" },
      { pid: 2141, user: "reports", cpu: 93.8, mem: 4.3, command: "node /opt/reports/render.js --batch 4412" },
      { pid: 2142, user: "reports", cpu: 91.4, mem: 3.9, command: "/usr/bin/chromium --headless --dump-dom" },
      { pid: 2214, user: "reports", cpu: 89.1, mem: 3.2, command: "/bin/bash /opt/reports/render-invoices.sh" },
      { pid: 700, user: "root", cpu: 0.3, mem: 0.2, command: "/usr/sbin/cron -f" },
      { pid: 812, user: "root", cpu: 0.1, mem: 0.3, command: "sshd: /usr/sbin/sshd -D" },
    ];
  },

  rules: [
    {
      pattern: /^top\b/,
      output: (ctx) => {
        const busy = ctx.world.processes.filter((process) => process.cpu >= 40);
        const load = busy.length ? ["28.40", "22.10", "18.40"] : ["0.62", "0.71", "0.58"];
        const idle = busy.length ? "1.2" : "94.2";
        const userCpu = busy.length ? "94.1" : "3.2";
        return [
          `top - 03:41:12 up 41 days,  3:12,  2 users,  load average: ${load.join(", ")}`,
          "Tasks: 141 total,   4 running, 137 sleeping,   0 stopped,   0 zombie",
          `%Cpu(s): ${userCpu} us,  2.1 sy,  0.0 ni, ${idle} id,  2.6 wa,  0.0 hi,  0.2 si`,
          `MiB Mem :   ${ctx.world.memTotalMb}.0 total,   ${ctx.world.memTotalMb - ctx.world.memUsedMb}.0 free,   ${ctx.world.memUsedMb}.0 used`,
          "",
          "  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND",
          ...[...ctx.world.processes]
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 6)
            .map(
              (process) =>
                `${String(process.pid).padStart(5)} ${process.user.padEnd(9)} 20   0  812000  ${String(process.mem * 800).padStart(6)}  ${String(process.cpu).padStart(5)}  ${String(process.mem).padStart(4)}   0:1${Math.round(process.cpu / 10)} ${process.command}`,
            ),
        ].join("\n");
      },
    },

    {
      pattern: /^systemctl\s+stop\s+cron$/,
      output: "Stopped cron.service - Regular background program processing daemon.",
      mutate: (world) => {
        const service = world.services.cron;
        if (service) service.active = false;
      },
    },

    {
      pattern: /^systemctl\s+restart\s+cron$/,
      output: [
        "Job for cron.service completed successfully.",
        "Note: restarting the daemon does not stop jobs that are already running.",
      ].join("\n"),
    },

    {
      pattern: /^ps\b.*\|/,
      output: (ctx) => {
        const lines = [
          "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
          ...ctx.world.processes.map(
            (process) =>
              `${process.user.padEnd(8)}${String(process.pid).padStart(6)} ${String(process.cpu).padStart(4)} ${String(process.mem).padStart(4)}  12044  3020 ?        S    08:12   0:0${Math.max(1, Math.round(process.cpu / 20))} ${process.command}`,
          ),
        ];
        const filter = ctx.raw.split("|")[1] ?? "";
        const term = filter.replace(/^\s*grep\s+(-[a-zA-Z]+\s+)*/, "").trim();
        return term ? lines.filter((line) => line.includes(term)).join("\n") : lines.join("\n");
      },
    },
  ],

  isFixed: (world) => duplicateGone(world) && runawayGone(world),

  seniorReplay: [
    "systemctl status cron",
    "cat /etc/cron.d/reports",
    "tail -n 50 /var/log/cron.log",
    "ps aux --sort=-%cpu",
    "cat /var/log/reports/render.log",
    "cat /opt/reports/render-invoices.sh",
    "sed -i 's|^\\*/5 .*render-invoices.sh|# duplicate removed by on-call|' /etc/cron.d/reports",
    "kill 2140 2141 2142 2214",
    "uptime",
    "ps aux | grep render",
  ],

  debrief: {
    whatHappened:
      "The reports-cron Ansible role was rewritten on 30 October. The new version appended its schedule to /etc/cron.d/reports instead of replacing the old one, so the file ended up with both */15 and */5 entries for the same script. render-invoices.sh has no lock: it creates a browser, walks every open invoice, and exits. A */15 run takes about twenty minutes on current volume, so the first overlapping */5 start was already competing with it. Each new run spawned another Chromium process, CPU climbed, every run got slower, and more runs piled up behind it. The queue fell six hours behind while the host stayed technically up. cron was healthy the whole time.",
    howToFix:
      "Remove one of the schedules and stop the copies that are already running. `sed -i 's|^\\*/5 .*render-invoices.sh|# duplicate removed by on-call|' /etc/cron.d/reports` leaves the original */15 entry, then `kill 2140 2141 2142 2214` stops the renderers that are already live. Verify with `uptime` — load falls as the processes exit — and `ps aux | grep render` to confirm nothing respawns. If you only kill the processes, the */5 schedule starts a new one within five minutes; if you only edit the file, the overlapping runs keep burning CPU until they finish.",
    prevention:
      "Treat crontab edits as replacements, not appends: configuration management should own the whole file and the role should assert its line count. Put a lock around long-running jobs (`flock -n /var/lock/render-invoices.lock`) so an overlap fails fast instead of doubling the load. Alert on job duration and queue age, not just CPU, and test schedule changes in staging with production-sized data so a */15 job that takes twenty minutes is obvious before it ships.",
  },
};
