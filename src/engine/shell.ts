/**
 * A small, fake bash.
 *
 * Design rule: every command reads or mutates `World`. Nothing here touches the
 * network, the filesystem, or a process table. That is what makes the terminal
 * safe to hand to a stranger, and cheap to test.
 *
 * Order of resolution:
 *   1. scenario rules  (precise, curated output)
 *   2. builtins        (generic filesystem / sysadmin behaviour)
 *   3. "command not found"
 */

import type {
  ExecutionResult,
  LineKind,
  OutputLine,
  Scenario,
  World,
} from "./types";

/* ------------------------------------------------------------------ */
/* world helpers                                                       */
/* ------------------------------------------------------------------ */

export function cloneWorld(world: World): World {
  return {
    ...world,
    files: { ...world.files },
    dirs: [...world.dirs],
    services: Object.fromEntries(
      Object.entries(world.services).map(([key, value]) => [key, { ...value }]),
    ),
    ports: world.ports.map((port) => ({ ...port })),
    processes: world.processes.map((process) => ({ ...process })),
    containers: world.containers.map((container) => ({ ...container })),
    pods: world.pods.map((pod) => ({ ...pod })),
    flags: { ...world.flags },
  };
}

export function createWorld(scenario: Scenario): World {
  const world: World = {
    cwd: `/home/${scenario.user}`,
    hostname: scenario.hostname,
    user: scenario.user,
    files: { ...scenario.files },
    dirs: [],
    services: {},
    ports: [],
    processes: [],
    containers: [],
    pods: [],
    diskTotalGb: 40,
    diskUsedGb: 12,
    memTotalMb: 7936,
    memUsedMb: 2100,
    flags: {},
    fixed: false,
  };

  // Every parent directory of a seeded file must exist for `ls` to work.
  for (const path of Object.keys(world.files)) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i += 1) {
      const dir = `/${parts.slice(0, i).join("/")}`;
      if (!world.dirs.includes(dir)) world.dirs.push(dir);
    }
  }

  scenario.seed(world);
  world.fixed = scenario.isFixed ? scenario.isFixed(world) : false;
  return world;
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === " " || char === "\t") {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Collapse whitespace so `df  -h` and `df -h` hit the same rule. */
export function normalise(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function resolvePath(cwd: string, target: string | undefined): string {
  if (!target || target === ".") return cwd;
  const base = target.startsWith("/") ? "" : cwd;
  const segments = `${base}/${target}`.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return `/${stack.join("/")}` || "/";
}

function isDir(world: World, path: string): boolean {
  const clean = path === "/" ? "/" : path;
  if (world.dirs.includes(clean)) return true;
  const prefix = clean === "/" ? "/" : `${clean}/`;
  return Object.keys(world.files).some((file) => file.startsWith(prefix));
}

function childrenOf(world: World, dir: string): { name: string; dir: boolean }[] {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  const seen = new Map<string, boolean>();

  for (const file of Object.keys(world.files)) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    if (!rest) continue;
    const [head] = rest.split("/");
    seen.set(head, rest.includes("/"));
  }
  for (const entry of world.dirs) {
    if (!entry.startsWith(prefix) || entry === dir) continue;
    const rest = entry.slice(prefix.length);
    if (!rest) continue;
    const [head] = rest.split("/");
    if (!seen.has(head)) seen.set(head, true);
  }

  return [...seen.entries()]
    .map(([name, isDirectory]) => ({ name, dir: isDirectory }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ["K", "M", "G", "T"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

function bytesUnder(world: World, dir: string): number {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  return Object.entries(world.files)
    .filter(([path]) => path === dir || path.startsWith(prefix))
    .reduce((total, [, body]) => total + body.length, 0);
}

/** Deleting data frees disk. Keeps `rm` honest without bespoke per-scenario code. */
function freeBytes(world: World, bytes: number): void {
  const gb = bytes / 1_000_000_000;
  world.diskUsedGb = Math.max(0, Math.round((world.diskUsedGb - gb) * 100) / 100);
}

function lastLines(body: string, count: number): string {
  const lines = body.replace(/\n+$/, "").split("\n");
  return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

function out(text: string, kind: LineKind = "out"): OutputLine[] {
  return text.replace(/\s+$/, "").split("\n").map((line) => ({ kind, text: line }));
}

/* ------------------------------------------------------------------ */
/* builtins                                                            */
/* ------------------------------------------------------------------ */

interface BuiltinContext {
  world: World;
  argv: string[];
  raw: string;
}

type Builtin = (ctx: BuiltinContext) => OutputLine[] | null;

const builtins: Record<string, Builtin> = {
  pwd: ({ world }) => out(world.cwd),

  whoami: ({ world }) => out(world.user),

  hostname: ({ world }) => out(world.hostname),

  date: () => out(new Date().toUTCString()),

  uptime: ({ world }) =>
    out(
      ` ${new Date().toUTCString().slice(17, 25)} up 41 days,  3:12,  2 users,  load average: ${(
        0.4 +
        world.processes.filter((p) => p.cpu > 40).length * 3.1
      ).toFixed(2)}, 1.02, 0.98`,
    ),

  uname: ({ argv }) =>
    out(argv.includes("-a") ? "Linux web-01 6.5.0-27-generic #28-Ubuntu SMP x86_64 GNU/Linux" : "Linux"),

  cd: ({ world, argv }) => {
    const target = resolvePath(world.cwd, argv[1]);
    if (!isDir(world, target)) return out(`cd: ${argv[1] ?? ""}: No such file or directory`, "err");
    world.cwd = target;
    return [];
  },

  ls: ({ world, argv }) => {
    const flags = argv.filter((a) => a.startsWith("-"));
    const target = resolvePath(world.cwd, argv.find((a) => !a.startsWith("-") && a !== "ls"));
    if (!isDir(world, target)) {
      if (world.files[target]) return out(target.split("/").pop() ?? target);
      return out(`ls: cannot access '${argv[1] ?? ""}': No such file or directory`, "err");
    }
    const entries = childrenOf(world, target);
    if (!entries.length) return [];
    if (flags.some((f) => f.includes("l"))) {
      return out(
        entries
          .map((entry) => {
            const path = `${target === "/" ? "" : target}/${entry.name}`;
            const size = entry.dir ? 4096 : (world.files[path] ?? "").length;
            return `${entry.dir ? "drwxr-xr-x" : "-rw-r--r--"} 1 root root ${String(size).padStart(8)} ${entry.name}`;
          })
          .join("\n"),
      );
    }
    return out(entries.map((entry) => (entry.dir ? `${entry.name}/` : entry.name)).join("  "));
  },

  cat: ({ world, argv }) => {
    const targets = argv.slice(1).filter((a) => !a.startsWith("-"));
    if (!targets.length) return out("cat: missing operand", "err");
    const lines: OutputLine[] = [];
    for (const target of targets) {
      const path = resolvePath(world.cwd, target);
      if (isDir(world, path)) lines.push(...out(`cat: ${target}: Is a directory`, "err"));
      else if (world.files[path] === undefined)
        lines.push(...out(`cat: ${target}: No such file or directory`, "err"));
      else lines.push(...out(world.files[path]));
    }
    return lines;
  },

  head: ({ world, argv }) => tailLike(world, argv, "head"),
  tail: ({ world, argv }) => tailLike(world, argv, "tail"),

  wc: ({ world, argv }) => {
    const target = argv[argv.length - 1];
    const body = world.files[resolvePath(world.cwd, target)];
    if (body === undefined) return out(`wc: ${target}: No such file or directory`, "err");
    return out(`${body.split("\n").length} ${target}`);
  },

  grep: ({ world, argv }) => {
    const flags = argv.filter((a) => a.startsWith("-"));
    const rest = argv.slice(1).filter((a) => !a.startsWith("-"));
    if (!rest.length) return out("usage: grep [OPTION]... PATTERNS [FILE]...", "err");
    const pattern = rest[0];
    const targets = rest.slice(1);
    const ignoreCase = flags.some((f) => f.includes("i"));
    const recursive = flags.some((f) => f.includes("r"));
    const showLine = flags.some((f) => f.includes("n"));
    const matcher = new RegExp(pattern, ignoreCase ? "i" : "");

    const search = (body: string): string[] =>
      body
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => matcher.test(line))
        .map(({ line, index }) => (showLine ? `${index + 1}:${line}` : line));

    const results: string[] = [];
    if (recursive) {
      const dir = resolvePath(world.cwd, targets[0] ?? ".");
      for (const [path, body] of Object.entries(world.files)) {
        if (path !== dir && !path.startsWith(`${dir}/`)) continue;
        results.push(...search(body).map((line) => `${path}:${line.replace(/^\d+:/, "")}`));
      }
    } else {
      for (const target of targets.length ? targets : ["-"]) {
        const path = resolvePath(world.cwd, target);
        const body = world.files[path];
        if (body === undefined) {
          results.push(`grep: ${target}: No such file or directory`);
          continue;
        }
        results.push(...search(body));
      }
    }
    return out(results.join("\n"));
  },

  df: ({ world }) => {
    const total = world.diskTotalGb;
    const used = Math.round(world.diskUsedGb * 10) / 10;
    const available = Math.max(0, Math.round((total - used) * 10) / 10);
    const percent = Math.round((used / total) * 100);
    return out(
      [
        "Filesystem      Size  Used Avail Use% Mounted on",
        `/dev/vda1        ${String(total).padStart(4)}G ${String(used).padStart(5)}G ${String(available).padStart(4)}G ${String(percent).padStart(3)}% /`,
        "tmpfs           3.9G     0  3.9G   0% /dev/shm",
      ].join("\n"),
    );
  },

  du: ({ world, argv }) => {
    const target = argv.find((a) => !a.startsWith("-") && a !== "du") ?? ".";
    const path = resolvePath(world.cwd, target);
    if (!isDir(world, path) && world.files[path] === undefined) {
      return out(`du: cannot access '${target}': No such file or directory`, "err");
    }
    const size = isDir(world, path) ? bytesUnder(world, path) : (world.files[path] ?? "").length;
    const human = argv.some((a) => a.includes("h"));
    return out(`${human ? humanBytes(size) : Math.ceil(size / 1024)}\t${target}`);
  },

  free: ({ world }) => {
    const used = world.memUsedMb;
    const total = world.memTotalMb;
    const free = total - used;
    return out(
      [
        "               total        used        free      shared  buff/cache   available",
        `Mem:           ${String(total).padStart(7)}     ${String(used).padStart(7)}     ${String(free).padStart(7)}        112     ${String(Math.round(free * 0.4)).padStart(7)}     ${String(free).padStart(7)}`,
        "Swap:           2047           0        2047",
      ].join("\n"),
    );
  },

  ps: ({ world }) =>
    out(
      [
        "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
        ...world.processes.map(
          (process) =>
            `${process.user.padEnd(8)}${String(process.pid).padStart(6)} ${String(process.cpu).padStart(4)} ${String(process.mem).padStart(4)}  12044  3020 ?        S    08:12   0:0${Math.max(1, Math.round(process.cpu / 20))} ${process.command}`,
        ),
      ].join("\n"),
    ),

  top: ({ world }) =>
    out(
      [
        "top - 03:14:02 up 41 days,  3:12,  2 users,  load average: 4.20, 2.10, 1.40",
        "Tasks: 128 total,   2 running, 126 sleeping,   0 stopped,   0 zombie",
        "%Cpu(s): 62.3 us,  4.1 sy,  0.0 ni, 31.2 id,  1.8 wa,  0.0 hi,  0.6 si",
        `MiB Mem :   ${world.memTotalMb}.0 total,   ${world.memTotalMb - world.memUsedMb}.0 free,   ${world.memUsedMb}.0 used`,
        "",
        "  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND",
        ...[...world.processes]
          .sort((a, b) => b.cpu - a.cpu)
          .slice(0, 8)
          .map(
            (process) =>
              `${String(process.pid).padStart(5)} ${process.user.padEnd(9)} 20   0  812000  ${String(process.mem * 800).padStart(6)}  ${String(process.cpu).padStart(5)}  ${String(process.mem).padStart(4)}   0:1${Math.round(process.cpu / 10)} ${process.command}`,
          ),
      ].join("\n"),
    ),

  systemctl: ({ world, argv }) => {
    const [, verb, name] = argv;
    const service = world.services[name];
    if (!service) return out(`Unit ${name ?? ""}.service could not be found.`, "err");

    if (verb === "status" || verb === undefined) {
      return out(
        [
          `● ${service.name}.service${service.description ? ` - ${service.description}` : ""}`,
          "     Loaded: loaded (/lib/systemd/system/" + service.name + ".service; enabled; preset: enabled)",
          `     Active: ${service.active ? "active (running)" : "failed (Result: exit-code)"} since Sat 2026-10-31 03:02:11 UTC; 12min ago`,
          `   Main PID: ${service.active ? 1204 : 1204} (${service.name})`,
          "",
          lastLines(service.log, 4)
            .split("\n")
            .map((line) => `Oct 31 03:0${Math.floor(Math.random() * 9)}:12 web systemd[1]: ${line}`)
            .join("\n"),
        ].join("\n"),
        service.active ? "out" : "err",
      );
    }

    if (verb === "restart" || verb === "start" || verb === "stop") {
      // Scenario rules normally intercept these to model the real failure.
      if (verb === "stop") {
        service.active = false;
        return out(`Stopped ${service.name}.service.`, "sys");
      }
      service.active = true;
      return out(`Job for ${service.name}.service completed successfully.`, "ok");
    }

    if (verb === "is-active") return out(service.active ? "active" : "failed");

    return out(`Unknown operation '${verb}'.`, "err");
  },

  journalctl: ({ world, argv }) => {
    const unitIndex = argv.findIndex((a) => a === "-u" || a === "--unit");
    const unit = unitIndex >= 0 ? argv[unitIndex + 1] : undefined;
    const countIndex = argv.findIndex((a) => a === "-n" || a === "--lines");
    const count = countIndex >= 0 ? Number(argv[countIndex + 1]) || 20 : 20;

    if (!unit) {
      const all = Object.values(world.services)
        .map((service) => service.log)
        .join("\n");
      return out(lastLines(all, count));
    }
    const service = world.services[unit];
    if (!service) return out(`-- No entries for ${unit}.service --`, "err");
    return out(
      lastLines(service.log, count)
        .split("\n")
        .map((line, index) => `Oct 31 03:${String(10 + index).padStart(2, "0")}:42 web ${unit}[1204]: ${line}`)
        .join("\n"),
    );
  },

  ss: ({ world }) => {
    const listening = world.ports.length > 0;
    if (!listening) return out("State  Recv-Q Send-Q Local Address:Port Peer Address:Port");
    const header = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process";
    const rows = world.ports.map(
      (port) => `LISTEN 0      511    ${port.local.padEnd(20)} 0.0.0.0:*     users:(("${port.process.split(" ")[0]}",pid=1204,fd=6))`,
    );
    return out([header, ...rows].join("\n"));
  },

  netstat: ({ world }) => {
    const header = "Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name";
    const rows = world.ports.map(
      (port) =>
        `${port.proto.padEnd(5)} 0      0 ${port.local.padEnd(23)} 0.0.0.0:*               LISTEN      ${port.process}`,
    );
    return out([header, ...rows].join("\n"));
  },

  curl: ({ world, argv }) => {
    const url = argv.find((a) => a.startsWith("http"));
    if (!url) return out("curl: try 'curl --help' for more information", "err");
    const host = url.replace(/^https?:\/\//, "").split("/")[0];
    const port = host.includes(":") ? Number(host.split(":")[1]) : url.startsWith("https") ? 443 : 80;
    const listening = world.ports.some((entry) => entry.local.endsWith(`:${port}`));
    if (!listening) {
      return out(
        `curl: (7) Failed to connect to ${host.split(":")[0]} port ${port} after 0 ms: Connection refused`,
        "err",
      );
    }
    return out(["HTTP/1.1 200 OK", "Server: nginx/1.24.0", "Content-Type: text/html", "", "<html>ok</html>"].join("\n"));
  },

  dig: ({ argv }) => {
    const name = argv.find((a) => !a.startsWith("+") && a !== "dig") ?? "example.com";
    if (name !== "example.com") {
      return out([`;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: ${Math.floor(Math.random() * 9000)}`, `;; QUESTION SECTION:`, `;${name}. IN A`, ""].join("\n"));
    }
    return out(
      [
        "; <<>> DiG 9.18.24 <<>> example.com",
        ";; global options: +cmd",
        ";; Got answer:",
        ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41299",
        ";; QUESTION SECTION:",
        ";example.com.\t\t\tIN\tA",
        "",
        ";; ANSWER SECTION:",
        "example.com.\t\t3600\tIN\tA\t93.184.216.34",
      ].join("\n"),
    );
  },

  ping: ({ argv }) => {
    const host = argv[argv.length - 1];
    return out(
      [
        `PING ${host} (${host}) 56(84) bytes of data.`,
        `64 bytes from ${host}: icmp_seq=1 ttl=57 time=12.4 ms`,
        `64 bytes from ${host}: icmp_seq=2 ttl=57 time=11.9 ms`,
        "",
        `--- ${host} ping statistics ---`,
        "2 packets transmitted, 2 received, 0% packet loss, time 1001ms",
        "rtt min/avg/max/mdev = 11.9/12.1/12.4/0.2 ms",
      ].join("\n"),
    );
  },

  "nginx": ({ argv }) => {
    if (argv[1] === "-t") {
      return out(
        ["nginx: the configuration file /etc/nginx/nginx.conf syntax is ok", "nginx: configuration file /etc/nginx/nginx.conf test is successful"].join("\n"),
        "ok",
      );
    }
    return out("nginx: invalid option", "err");
  },

  docker: ({ world, argv }) => {
    const [, verb, target] = argv;
    if (verb === "ps") {
      if (!world.containers.length) return out("CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES");
      return out(
        [
          "CONTAINER ID   IMAGE                 STATUS          PORTS                    NAMES",
          ...world.containers.map(
            (container) =>
              `${container.id}   ${container.image.padEnd(20)}  ${container.status.padEnd(14)}  ${container.name === "api" ? "0.0.0.0:3000->3000/tcp" : ""}   ${container.name}`,
          ),
        ].join("\n"),
      );
    }
    if (verb === "logs") {
      const container = world.containers.find((entry) => entry.name === target || entry.id === target);
      if (!container) return out(`Error: No such container: ${target}`, "err");
      return out(container.log);
    }
    return out(`docker: '${verb ?? ""}' is not a docker command.`, "err");
  },

  kubectl: ({ world, argv }) => {
    const [, verb, kindOrName, , target] = argv;
    if (kindOrName === "pods" || kindOrName === "pod" || kindOrName === "po") {
      if (verb === "get") {
        return out(
          [
            "NAME                        READY   STATUS             RESTARTS   AGE",
            ...world.pods.map(
              (pod) => `${pod.name.padEnd(28)}${pod.ready.padEnd(8)}${pod.status.padEnd(18)}${String(pod.restarts).padEnd(11)}${pod.age}`,
            ),
          ].join("\n"),
        );
      }
    }
    if (verb === "describe" && (kindOrName === "pod" || kindOrName === "pods")) {
      const pod = world.pods.find((entry) => entry.name === target);
      if (!pod) return out(`Error from server (NotFound): pods "${target}" not found`, "err");
      return out(pod.describe);
    }
    if (verb === "logs") {
      const pod = world.pods.find((entry) => entry.name === (target ?? kindOrName));
      if (!pod) return out(`Error from server (NotFound): pods "${target ?? kindOrName}" not found`, "err");
      return out(pod.log);
    }
    if (verb === "get" && (kindOrName === "secret" || kindOrName === "secrets")) {
      return out(
        ["NAME                  TYPE     DATA   AGE", "app-env               Opaque   4      12d", "regcred               kubernetes.io/dockerconfigjson   1   31d"].join("\n"),
      );
    }
    return out(`error: the server doesn't have a resource type "${kindOrName ?? ""}"`, "err");
  },

  rm: ({ world, argv }) => {
    const targets = argv.slice(1).filter((a) => !a.startsWith("-"));
    if (!targets.length) return out("rm: missing operand", "err");
    for (const target of targets) {
      const path = resolvePath(world.cwd, target);
      const prefix = `${path}/`;
      let freed = 0;
      for (const [file, body] of Object.entries(world.files)) {
        if (file === path || file.startsWith(prefix)) {
          freed += body.length;
          delete world.files[file];
        }
      }
      if (!freed && !isDir(world, path)) {
        return out(`rm: cannot remove '${target}': No such file or directory`, "err");
      }
      world.dirs = world.dirs.filter((dir) => dir !== path && !dir.startsWith(prefix));
      freeBytes(world, freed);
    }
    return [];
  },

  truncate: ({ world, argv }) => {
    const path = resolvePath(world.cwd, argv[argv.length - 1]);
    const body = world.files[path];
    if (body === undefined) return out(`truncate: cannot open '${argv[argv.length - 1]}' for writing: No such file or directory`, "err");
    freeBytes(world, body.length);
    world.files[path] = "";
    return [];
  },

  touch: ({ world, argv }) => {
    const path = resolvePath(world.cwd, argv[argv.length - 1]);
    if (world.files[path] === undefined) world.files[path] = "";
    return [];
  },

  mkdir: ({ world, argv }) => {
    const path = resolvePath(world.cwd, argv[argv.length - 1]);
    if (!world.dirs.includes(path)) world.dirs.push(path);
    return [];
  },

  history: () => [],
};

function tailLike(world: World, argv: string[], mode: "head" | "tail"): OutputLine[] {
  const countIndex = argv.findIndex((a) => /^-\d+$/.test(a) || a === "-n");
  let count = 10;
  if (countIndex >= 0) {
    count = /^-\d+$/.test(argv[countIndex])
      ? Number(argv[countIndex].slice(1))
      : Number(argv[countIndex + 1]) || 10;
  }
  const follow = argv.includes("-f");
  const target = argv[argv.length - 1];
  const path = resolvePath(world.cwd, target);
  const body = world.files[path];

  if (body === undefined) return out(`${mode}: cannot open '${target}' for reading: No such file or directory`, "err");

  const lines = body.replace(/\n+$/, "").split("\n");
  const slice = mode === "head" ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count));
  if (follow) slice.push("", "… following. Ctrl-C to stop.");
  return out(slice.join("\n"));
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

export interface ShellResult extends ExecutionResult {
  /** True when the command produced no output at all (e.g. `rm`). */
  silent: boolean;
}

export function execute(scenario: Scenario, world: World, raw: string): ShellResult {
  const next = cloneWorld(world);
  const line = normalise(raw);
  if (!line) return { world: next, lines: [], silent: true };

  let argv = tokenize(line);
  // `sudo` is noise in this simulation, but engineers type it constantly.
  if (argv[0] === "sudo") argv = argv.slice(1);
  const command = argv.join(" ");

  const badAction = scenario.badActions.find((action) => action.pattern.test(command));

  // 1. Scenario rules win, so curated output can model the interesting failure.
  for (const rule of scenario.rules) {
    if (rule.when && !rule.when(next)) continue;
    if (!rule.pattern.test(command)) continue;
    const text = typeof rule.output === "function" ? rule.output({ world: next, argv, raw: line }) : rule.output;
    rule.mutate?.(next);
    if (scenario.isFixed?.(next)) next.fixed = true;
    return {
      world: next,
      lines: out(text, rule.asError ? "err" : "out"),
      badId: badAction?.id,
      silent: !text,
    };
  }

  // 2. Builtins.
  const bin = argv[0];
  const builtin = builtins[bin];
  if (builtin) {
    const lines = builtin({ world: next, argv, raw: line }) ?? [];
    if (scenario.isFixed?.(next)) next.fixed = true;
    return { world: next, lines, badId: badAction?.id, silent: lines.length === 0 };
  }

  // 3. Anything else fails the way a real shell fails.
  return {
    world: next,
    lines: [{ kind: "err", text: `bash: ${bin}: command not found` }],
    badId: badAction?.id,
    silent: false,
  };
}

/* ------------------------------------------------------------------ */
/* tab completion                                                      */
/* ------------------------------------------------------------------ */

const COMMON_COMMANDS = [
  "cat", "cd", "curl", "date", "df", "dig", "docker", "du", "free", "grep", "head",
  "history", "hostname", "journalctl", "kubectl", "ls", "mkdir", "netstat", "nginx",
  "openssl", "ping", "ps", "pwd", "rm", "ss", "systemctl", "tail", "top", "touch",
  "truncate", "uptime", "wc", "whoami",
];

export interface Completion {
  /** The full replacement line, ready to assign to the input. */
  value: string;
  /** All candidates, so the UI can show a menu when there are several. */
  options: string[];
}

/**
 * Tab completion over commands, paths, service names and container names.
 * Pure: takes the current line and returns the replacement.
 */
export function complete(_scenario: Scenario, world: World, line: string): Completion {
  const parts = line.split(" ");
  const isFirst = parts.length === 1;
  const fragment = parts[parts.length - 1];

  const paths = (): string[] => {
    const all = [...Object.keys(world.files), ...world.dirs];
    return all.map((path) => {
      const dir = world.cwd === "/" ? "" : world.cwd;
      if (path.startsWith(`${world.cwd}/`)) return path.slice(dir.length + 1);
      return path;
    });
  };

  let pool: string[];
  if (isFirst) {
    pool = COMMON_COMMANDS;
  } else if (parts[0] === "systemctl" || parts[0] === "journalctl") {
    pool = Object.keys(world.services);
  } else if (parts[0] === "docker" && parts[1] === "logs") {
    pool = world.containers.map((container) => container.name);
  } else if (parts[0] === "kubectl") {
    pool = world.pods.map((pod) => pod.name);
  } else {
    pool = paths();
  }

  const matches = pool.filter((entry) => entry.startsWith(fragment));
  if (!matches.length) return { value: line, options: [] };
  if (matches.length === 1) {
    const replaced = [...parts.slice(0, -1), matches[0]].join(" ");
    return { value: `${replaced}${isFirst ? " " : ""}`, options: matches };
  }
  return { value: line, options: matches };
}

/** A few commands the UI can offer as chips without spoiling the answer. */
export function knownCommands(scenario: Scenario): string[] {
  const fromRules = scenario.rules
    .map((rule) => rule.pattern.source)
    .filter((source) => /^[a-z]+/.test(source))
    .map((source) => source.replace(/\\/g, "").replace(/\[\^?\]?/g, "").replace(/[()^$|?*+.]/g, " ").trim().split(" ")[0]);
  return [...new Set([...COMMON_COMMANDS, ...fromRules])].sort();
}
