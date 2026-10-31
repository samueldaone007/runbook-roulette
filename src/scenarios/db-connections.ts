/**
 * Scenario 8 — The connection pool is full.
 *
 * Teaching goal: "the database is down" is not the same as "the database is
 * full of other people's work". Postgres is healthy and accepting superuser
 * connections; the reporting job simply took every ordinary slot with one
 * pathological query. Restarting the database is an outage, not a fix, and
 * raising max_connections hides the query instead of repairing it.
 *
 * State is real: `psql` reads (and clears) world.flags, and the app only
 * recovers once the reporting backends are gone.
 */

import type { Scenario, World } from "../engine/types";

const freed = (world: World) => Boolean(world.flags.connectionsFreed);

const sessionCount = (world: World) => (freed(world) ? 16 : 97);

const activityDetail = (world: World) =>
  freed(world)
    ? [
        " pid  | usename  |   age    | query",
        "------+----------+----------+------------------------------------------",
        " 1180 | dba      | 00:00:04 | select pid, usename, now() - query_start as age, query from pg_stat_activity where state = 'active'",
        " 1210 | checkout | 00:00:02 | select id, status from carts where user_id = $1",
        " 1211 | checkout | 00:00:01 | insert into orders (id, total) values ($1, $2)",
        "(3 rows)",
      ].join("\n")
    : [
        "  pid  | usename   |   age    | query",
        "-------+-----------+----------+-------------------------------------------------------------",
        "  5041 | reporting | 00:47:12 | SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN...",
        "  5042 | reporting | 00:47:11 | SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN...",
        "  5043 | reporting | 00:47:11 | SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN...",
        "  5044 | reporting | 00:47:10 | SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN...",
        "  5045 | reporting | 00:47:10 | SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN...",
        "  ...",
        "(90 rows)",
      ].join("\n");

const usernameCounts = (world: World) =>
  freed(world)
    ? [
        " usename  | count",
        "----------+-------",
        " checkout |    10",
        " dba      |     1",
        " postgres |     5",
        "(3 rows)",
      ].join("\n")
    : [
        " usename   | count",
        "-----------+-------",
        " checkout  |     1",
        " dba       |     1",
        " postgres  |     5",
        " reporting |    90",
        "(4 rows)",
      ].join("\n");

const stateCounts = (world: World) =>
  freed(world)
    ? [
        " state  | count",
        "--------+-------",
        " active |     3",
        " idle   |    13",
        "(2 rows)",
      ].join("\n")
    : [
        " state  | count",
        "--------+-------",
        " active |    91",
        " idle   |     6",
        "(2 rows)",
      ].join("\n");

export const dbConnections: Scenario = {
  id: "db-connections",
  title: "The database is full of someone else's work",
  category: "database",
  difficulty: "senior",
  parSeconds: 600,

  alert: {
    service: "shop/checkout-api",
    severity: "P1",
    symptom: "checkout returns 503; the API logs say it cannot get a database connection, but the database host answers",
    at: "03:17",
  },

  hostname: "db-01",
  user: "dba",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 03:14:22 2026 from 10.20.4.11",
    "PostgreSQL 16 primary. You are logged in as a superuser, so reserved slots still work for you.",
  ],

  rootCauseId: "reporting-cross-join",
  rootCauseSummary:
    "Reporting release 2.7.0 replaced an indexed invoice query with a three-table cross join and raised its pool to 90 connections. A migration the night before had dropped idx_invoices_status, so the query became a 47-minute nested loop. All 90 reporting backends are running it, filling max_connections=100 and leaving no ordinary slot for checkout. Postgres itself is healthy.",
  options: [
    {
      id: "reporting-cross-join",
      label: "Ninety reporting sessions are running one runaway cross-join query and have filled every connection slot",
      detail: "pg_stat_activity shows 90 identical active queries from the reporting user, all about 47 minutes old.",
    },
    {
      id: "max-connections-too-low",
      label: "max_connections=100 is simply too low for this workload and should be raised",
      detail: "Would explain a busy system, but 90 of the slots are held by one broken query from one job.",
    },
    {
      id: "api-pool-leak",
      label: "The checkout API leaked its own pool connections and exhausted the server",
      detail: "Only one checkout backend exists; the other 90 belong to the reporting user.",
    },
    {
      id: "postgres-crash",
      label: "Postgres crashed and restarted, dropping every session",
      detail: "Would show a crash recovery in the log and a young postmaster; this instance has been up for weeks.",
    },
  ],

  goodSteps: [
    {
      id: "pg-log",
      label: "Read the database log for the actual refusal",
      command: "tail -n 50 /var/log/postgresql/postgresql-16-main.log",
      match: /^(tail|cat|less|grep)\b.*postgresql-16-main\.log/,
      weight: 2,
    },
    {
      id: "app-log",
      label: "Confirm the app is failing on connection acquisition, not queries",
      command: "cat /var/log/checkout-api/error.log",
      match: /^(cat|tail|less|grep)\b.*checkout-api\/error\.log/,
      weight: 2,
    },
    {
      id: "max-connections",
      label: "Read the configured connection ceiling",
      command: 'psql -c "show max_connections"',
      match: /^psql\b.*show\s+max_connections/,
      weight: 1,
    },
    {
      id: "session-count",
      label: "Count the sessions actually connected",
      command: 'psql -c "select count(*) from pg_stat_activity"',
      match: /^psql\b.*count\(\*\).*pg_stat_activity/,
      weight: 2,
    },
    {
      id: "state-count",
      label: "Break the sessions down by state",
      command: 'psql -c "select state, count(*) from pg_stat_activity group by state"',
      match: /^psql\b.*state\s*,\s*count\(\*\).*group\s+by\s+state/,
      weight: 1,
    },
    {
      id: "runaway-query",
      label: "Identify the user and query holding the slots",
      command:
        "psql -c \"select pid, usename, now() - query_start as age, query from pg_stat_activity where state = 'active' order by query_start limit 5\"",
      match: /^psql\b.*pg_stat_activity.*state\s*=\s*['"]?active/,
      weight: 3,
    },
    {
      id: "report-code",
      label: "Read the reporting job that opens the pool",
      command: "cat /opt/reports/nightly.js",
      match: /^(cat|less)\b.*nightly\.js/,
      weight: 2,
    },
    {
      id: "pg-conf",
      label: "Check the timeout that should have stopped this",
      command: 'psql -c "show idle_in_transaction_session_timeout"',
      match: /^psql\b.*idle_in_transaction_session_timeout/,
      weight: 2,
    },
    {
      id: "terminate-reporting",
      label: "Terminate the runaway reporting backends",
      command: `psql -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'reporting'"`,
      match: /^psql\b.*pg_terminate_backend\b.*reporting/,
      weight: 3,
    },
    {
      id: "verify-slots",
      label: "Verify ordinary slots are available again",
      command: 'psql -c "select usename, count(*) from pg_stat_activity group by usename"',
      match: /^psql\b.*usename.*group\s+by\s+usename/,
      weight: 2,
    },
  ],

  badActions: [
    {
      id: "restart-postgres",
      label: "Restarted PostgreSQL to clear the connections",
      pattern: /^systemctl\s+restart\s+postgresql/,
      penalty: 12,
      why: "A restart drops every session — including healthy checkouts — and the reporting job reconnects with the same query during the next run. You traded a partial outage for a total one.",
    },
    {
      id: "raise-max-connections",
      label: "Raised max_connections instead of stopping the query",
      pattern: /^psql\b.*alter\s+system\s+set\s+max_connections/i,
      penalty: 6,
      why: "The 90 sessions are one broken query. Raising the ceiling hides the leak, needs a restart to apply, and consumes memory per backend.",
    },
    {
      id: "stop-postgres",
      label: "Stopped PostgreSQL",
      pattern: /^systemctl\s+stop\s+postgresql/,
      penalty: 15,
      why: "Now every application is down and you still have not looked at pg_stat_activity.",
    },
    {
      id: "drop-data",
      label: "Dropped or truncated production tables",
      pattern: /^psql\b.*(drop|truncate)\s+(table\s+)?(invoices|invoice_lines|orders|report_cache)/i,
      penalty: 15,
      why: "Destroying data does not free a connection slot, and it turns an availability incident into a recovery project.",
    },
    {
      id: "kill-postmaster",
      label: "Killed the postmaster process",
      pattern: /^kill\s+(-9\s+)?1\b/,
      penalty: 15,
      why: "Killing the postmaster forces crash recovery and takes the whole database down, including the evidence.",
    },
  ],

  hint: "Use your superuser slot: `psql -c \"select usename, state, now() - query_start as age, query from pg_stat_activity where state = 'active' order by query_start limit 5\"`. Ninety reporting backends are running the same query. Terminate them with `pg_terminate_backend` — do not restart the database.",

  files: {
    "/var/log/postgresql/postgresql-16-main.log": [
      "2026-10-31 02:11:02.114 UTC [1180] LOG:  database system is ready to accept connections",
      "2026-10-31 02:57:58.883 UTC [3021] FATAL:  sorry, too many clients already",
      "2026-10-31 02:57:58.884 UTC [3022] FATAL:  remaining connection slots are reserved for non-replication superuser connections",
      "2026-10-31 02:58:01.117 UTC [3023] FATAL:  sorry, too many clients already",
      "2026-10-31 02:58:04.441 UTC [3024] FATAL:  sorry, too many clients already",
      "2026-10-31 02:59:11.002 UTC [1180] LOG:  checkpoints are occurring too frequently (18 seconds apart)",
      "2026-10-31 02:59:11.002 UTC [1180] HINT:  Consider increasing the configuration parameter \"checkpoint_timeout\".",
      "2026-10-31 03:06:44.991 UTC [5044] LOG:  duration: 2850002 ms  statement: SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN invoice_lines l CROSS JOIN tax_rates t WHERE i.status = 'open'",
    ].join("\n"),

    "/var/log/checkout-api/error.log": [
      "2026-10-31T02:57:58.002Z error pool: timeout exceeded when trying to connect (10000ms)",
      "2026-10-31T02:57:58.003Z error GET /checkout 503 - database unavailable",
      "2026-10-31T02:57:58.079Z error pool: timeout exceeded when trying to connect (10000ms)",
      "2026-10-31T02:57:58.080Z error GET /checkout 503 - database unavailable",
      "2026-10-31T02:58:08.117Z warn  pool: 9 clients queued, 1 connected (max 10)",
      "2026-10-31T02:58:08.118Z error pool: timeout exceeded when trying to connect (10000ms)",
      "2026-10-31T02:58:18.229Z error GET /cart 503 - database unavailable",
    ].join("\n"),

    "/opt/reports/nightly.js": [
      "// reporting 2.7.0 — deployed 2026-10-30 23:10",
      "const { Pool } = require('pg');",
      "",
      "// Pool raised from 10 to 90 to \"parallelise month-end\".",
      "const pool = new Pool({",
      "  host: 'db-01',",
      "  database: 'shop',",
      "  user: 'reporting',",
      "  max: 90,",
      "});",
      "",
      "// 2.7.0 query rewrite: one scan over open invoices and all line items.",
      "const RUNAWAY = `",
      "  SELECT i.id, l.sku, l.qty, t.rate",
      "  FROM invoices i",
      "  CROSS JOIN invoice_lines l",
      "  CROSS JOIN tax_rates t",
      "  WHERE i.status = 'open'",
      "`;",
      "",
      "async function main() {",
      "  const invoices = await loadOpenInvoices();",
      "  const pending = invoices.map(() => pool.query(RUNAWAY));",
      "  await Promise.all(pending);",
      "  // process exits without pool.end(); sessions linger until the server drops them",
      "}",
      "",
      "main();",
    ].join("\n"),

    "/etc/postgresql/16/main/postgresql.conf": [
      "# PostgreSQL 16 primary — db-01",
      "listen_addresses = '*'",
      "max_connections = 100",
      "superuser_reserved_connections = 3",
      "shared_buffers = 2GB",
      "effective_cache_size = 6GB",
      "",
      "# disabled by tuning role 2026-09-14 — 'could kill long reports'",
      "idle_in_transaction_session_timeout = 0",
      "statement_timeout = 0",
      "",
      "log_min_duration_statement = 5000",
      "log_connections = on",
    ].join("\n"),

    "/var/log/change.log": [
      "2026-10-30 22:41:18 migration: 20261030_drop_unused_indexes dropped idx_invoices_status",
      "2026-10-30 22:41:18 migration: note - 'verify reporting query plans before month-end'",
      "2026-10-30 23:10:02 deploy: reporting 2.7.0 (invoice_totals query rewrite)",
      "2026-10-30 23:10:03 deploy: reporting pool max 10 -> 90",
      "2026-10-31 02:11:00 cron: reporting nightly started",
      "2026-10-31 02:58:04 alert: checkout-api 503 rate above 10%",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 200;
    world.diskUsedGb = 84.2;
    world.memTotalMb = 16384;
    world.memUsedMb = 12840;

    world.services = {
      postgresql: {
        name: "postgresql",
        active: true,
        description: "PostgreSQL RDBMS",
        log: [
          "database system is ready to accept connections",
          "FATAL:  sorry, too many clients already",
          "FATAL:  remaining connection slots are reserved for non-replication superuser connections",
          "duration: 2850002 ms  statement: SELECT i.id, l.sku, l.qty, t.rate FROM invoices i CROSS JOIN invoice_lines l CROSS JOIN tax_rates t WHERE i.status = 'open'",
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
      { proto: "tcp", local: "10.0.0.31:5432", process: "postgres" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 1180, user: "postgres", cpu: 2.2, mem: 0.9, command: "postgres -D /var/lib/postgresql/16/main" },
      { pid: 5041, user: "postgres", cpu: 96.4, mem: 1.8, command: "postgres: reporting shop [local] SELECT" },
      { pid: 5042, user: "postgres", cpu: 94.9, mem: 1.8, command: "postgres: reporting shop [local] SELECT" },
      { pid: 5043, user: "postgres", cpu: 93.1, mem: 1.8, command: "postgres: reporting shop [local] SELECT" },
      { pid: 2204, user: "root", cpu: 0.2, mem: 0.4, command: "sshd: /usr/sbin/sshd -D" },
    ];
  },

  rules: [
    {
      pattern: /^psql\b.*pg_terminate_backend\b.*reporting/,
      output: (ctx) =>
        freed(ctx.world)
          ? " pg_terminate_backend \n----------------------\n(0 rows)"
          : [
              " pg_terminate_backend ",
              "----------------------",
              " t",
              " t",
              " t",
              " t",
              " t",
              " ...",
              "(90 rows)",
            ].join("\n"),
      mutate: (world) => {
        world.flags.connectionsFreed = true;
      },
    },

    {
      pattern: /^psql\b.*pg_stat_activity.*state\s*=\s*['"]?active/,
      output: (ctx) => activityDetail(ctx.world),
    },

    {
      pattern: /^psql\b.*usename.*group\s+by\s+usename/,
      output: (ctx) => usernameCounts(ctx.world),
    },

    {
      pattern: /^psql\b.*state\s*,\s*count\(\*\).*group\s+by\s+state/,
      output: (ctx) => stateCounts(ctx.world),
    },

    {
      pattern: /^psql\b.*count\(\*\).*pg_stat_activity/,
      output: (ctx) => ` count\n-------\n ${String(sessionCount(ctx.world)).padStart(5)}\n(1 row)`,
    },

    {
      pattern: /^psql\b.*show\s+max_connections/,
      output: " max_connections\n-----------------\n 100\n(1 row)",
    },

    {
      pattern: /^psql\b.*show\s+idle_in_transaction_session_timeout/,
      output: " idle_in_transaction_session_timeout\n-------------------------------------\n 0\n(1 row)",
    },

    {
      pattern: /^psql\b.*select\s+1\b/,
      output: " ?column?\n----------\n        1\n(1 row)",
    },

    {
      pattern: /^systemctl\s+restart\s+postgresql$/,
      output: [
        "Job for postgresql.service completed successfully.",
        "All sessions were terminated during the restart.",
        "Warning: the reporting job reconnects on its next run with the same cross join.",
      ].join("\n"),
      mutate: (world) => {
        world.flags.connectionsFreed = true;
      },
      asError: true,
    },

    {
      pattern: /^psql\b.*alter\s+system\s+set\s+max_connections/i,
      output: [
        "ALTER SYSTEM",
        "Warning: the new value only applies after a restart, and 90 of the current sessions are one broken query.",
      ].join("\n"),
    },

    {
      pattern: /^psql\b/,
      output:
        "psql: note: this drill only answers the pg_stat_activity and configuration queries shown in the hint.",
      asError: true,
    },

    {
      pattern: /^top\b/,
      output: (ctx) =>
        [
          "top - 03:17:41 up 61 days,  7:42,  2 users,  load average: 12.82, 11.40, 9.88",
          "Tasks: 108 total,  91 running,  17 sleeping,   0 stopped,   0 zombie",
          "%Cpu(s): 97.4 us,  1.1 sy,  0.0 ni,  0.2 id,  0.9 wa,  0.0 hi,  0.4 si",
          `MiB Mem :  ${ctx.world.memTotalMb}.0 total,   ${ctx.world.memTotalMb - ctx.world.memUsedMb}.0 free,   ${ctx.world.memUsedMb}.0 used`,
          "",
          "  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND",
          ...[...ctx.world.processes]
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 6)
            .map(
              (process) =>
                `${String(process.pid).padStart(5)} ${process.user.padEnd(9)} 20   0  812000  ${String(process.mem * 800).padStart(6)}  ${String(process.cpu).padStart(5)}  ${String(process.mem).padStart(4)}   0:1${Math.round(process.cpu / 10)} ${process.command}`,
            ),
        ].join("\n"),
    },
  ],

  isFixed: freed,

  seniorReplay: [
    "tail -n 50 /var/log/postgresql/postgresql-16-main.log",
    "cat /var/log/checkout-api/error.log",
    'psql -c "show max_connections"',
    'psql -c "select count(*) from pg_stat_activity"',
    'psql -c "select state, count(*) from pg_stat_activity group by state"',
    "psql -c \"select pid, usename, now() - query_start as age, query from pg_stat_activity where state = 'active' order by query_start limit 5\"",
    "cat /opt/reports/nightly.js",
    'psql -c "show idle_in_transaction_session_timeout"',
    `psql -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'reporting'"`,
    'psql -c "select usename, count(*) from pg_stat_activity group by usename"',
  ],

  debrief: {
    whatHappened:
      "Two changes landed on 30 October. First a migration dropped idx_invoices_status, noting that query plans should be checked before month-end. Hours later reporting 2.7.0 rewrote its invoice totals query as a three-table cross join and raised its pool from 10 to 90 to make the job faster. At 02:11 the nightly run opened 90 backends; every one began the same unindexed cross join. The query became a nested loop that ran for 47 minutes, and all 90 sessions stayed active. With max_connections at 100 and three slots reserved for superusers, checkout could not acquire a connection at all, so every request returned 503. You got in because you are a superuser. Postgres was never down; it was full.",
    howToFix:
      "Stop the backends that are consuming the slots, then repair the query. `psql -c \"select pg_terminate_backend(pid) from pg_stat_activity where usename = 'reporting'\"` frees the 90 sessions immediately; check `pg_stat_activity` and watch checkout acquire connections again. Do not restart Postgres: it drops every healthy session and the job simply reconnects. Do not raise max_connections: each backend costs memory and the next report run fills the new ceiling too. The durable fixes are to restore the index (CREATE INDEX CONCURRENTLY), bound the reporting pool, set statement_timeout and idle_in_transaction_session_timeout, and make the report query stop scanning the whole catalogue.",
    prevention:
      "Review query plans whenever an index is dropped, and run migrations against production-sized data before the next scheduled job can consume them. Cap per-job pools independently of the application pool, and alert on session count by user, not just database up/down. Set statement_timeout and idle_in_transaction_session_timeout so no single report can hold a slot for 47 minutes. Finally, keep superuser_reserved_connections and test that an operator can still log in when ordinary slots are exhausted.",
  },
};
