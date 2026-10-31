/**
 * Core types for the simulation.
 *
 * Everything here is plain data. No React, no DOM, no side effects — the engine
 * is meant to be exercised by tests and reused by any UI.
 */

export type Category =
  | "linux"
  | "network"
  | "tls"
  | "containers"
  | "orchestration"
  | "database"
  | "access";

export type Difficulty = "junior" | "mid" | "senior";

export type LineKind = "cmd" | "out" | "err" | "sys" | "ok";

export interface OutputLine {
  kind: LineKind;
  text: string;
}

export interface Service {
  name: string;
  /** `systemctl is-active` equivalent. */
  active: boolean;
  /** Raw journal tail. Only the last N lines are shown by journalctl. */
  log: string;
  /** Shown by `systemctl status` under "Loaded". */
  description?: string;
}

export interface Port {
  proto: "tcp" | "udp";
  local: string;
  process: string;
}

export interface Process {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

export interface Container {
  id: string;
  image: string;
  name: string;
  status: string;
  log: string;
}

export interface Pod {
  name: string;
  ready: string;
  status: string;
  restarts: number;
  age: string;
  log: string;
  describe: string;
}

/**
 * Everything a scenario can mutate at runtime. The engine clones this on every
 * command so `execute` stays pure and a run can be replayed from its log.
 */
export interface World {
  cwd: string;
  hostname: string;
  user: string;
  /** Absolute path -> file body. */
  files: Record<string, string>;
  /** Explicit directories, so `mkdir` survives and empty dirs still list. */
  dirs: string[];
  services: Record<string, Service>;
  ports: Port[];
  processes: Process[];
  containers: Container[];
  pods: Pod[];
  diskTotalGb: number;
  diskUsedGb: number;
  memTotalMb: number;
  memUsedMb: number;
  /** Arbitrary scenario state, e.g. `{ certRenewed: true }`. */
  flags: Record<string, boolean>;
  /** Set by a rule (or `isFixed`) once the incident is actually resolved. */
  fixed: boolean;
}

/** What a scenario rule hands back to the shell. */
export interface RuleResult {
  output: string;
  /** Mutate a draft world. Kept as a callback so rules stay declarative. */
  mutate?: (world: World) => void;
  /** Force the terminal to treat the output as an error (red). */
  asError?: boolean;
}

export interface RuleContext {
  world: World;
  argv: string[];
  raw: string;
}

export interface Rule {
  /** Tested against the normalised command line. */
  pattern: RegExp;
  /** Optional extra gate, e.g. only fire after a cert was renewed. */
  when?: (world: World) => boolean;
  output: string | ((ctx: RuleContext) => string);
  mutate?: (world: World) => void;
  asError?: boolean;
}

/** One step an experienced engineer would take. Used for scoring and replay. */
export interface CommandStep {
  id: string;
  label: string;
  /** Canonical command shown in the "senior replay". */
  command: string;
  /** How the step is detected in the user's history. Defaults to exact match. */
  match?: RegExp;
  /** Relative weight. Defaults to 1. */
  weight?: number;
}

export interface BadAction {
  id: string;
  label: string;
  pattern: RegExp;
  /** Points removed from the safety score. */
  penalty: number;
  why: string;
}

export interface RootCauseOption {
  id: string;
  label: string;
  /** Shown under the option in the diagnosis form. */
  detail?: string;
}

export interface Alert {
  service: string;
  severity: "P1" | "P2" | "P3";
  /** Deliberately vague, the way a real alert reads at 03:00. */
  symptom: string;
  /** Pager timestamp, display only. */
  at: string;
}

export interface Scenario {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  /** Target completion time, in seconds. Beating this maxes the speed score. */
  parSeconds: number;
  alert: Alert;
  hostname: string;
  user: string;
  /** Printed once in the terminal before the first prompt. */
  banner: string[];

  rootCauseId: string;
  rootCauseSummary: string;
  options: RootCauseOption[];

  goodSteps: CommandStep[];
  badActions: BadAction[];
  hint: string;

  /** Virtual filesystem seeded into the world. */
  files: Record<string, string>;
  /** Everything else the world starts with. */
  seed: (world: World) => void;
  /** Extra commands this scenario answers precisely. */
  rules: Rule[];
  /** True once the box is actually healthy again. */
  isFixed?: (world: World) => boolean;

  seniorReplay: string[];
  debrief: {
    whatHappened: string;
    howToFix: string;
    prevention: string;
  };
}

export interface ExecutionResult {
  world: World;
  lines: OutputLine[];
  /** Set when a destructive/risky command matched a bad action. */
  badId?: string;
}
