# Runbook Roulette

Practise production incident response without breaking production.

You pull a lever, get a deliberately vague page at 03:00, and land in a simulated
terminal on the box that is on fire. You investigate, change the world with real
commands, name the root cause, and get a scored debrief: what a senior engineer
would have done, which steps you missed, and which commands made things worse.

The whole simulation is local. No accounts, no network calls, nothing to sign up
for.

## The loop

1. **Spin** on the home page. Filter by category or difficulty if you are
   hunting something specific. One incident is drawn from the filtered deck.
2. **Read the page.** The alert tells you the symptom, the service and nothing
   useful. That is the point.
3. **Investigate** in the terminal. Every command runs against real per-scenario
   state, so `df -h` reflects what is actually on disk and a `sed -i` edit is
   still there on the next command.
4. **Fix it.** Some scenarios only go healthy after a reload, a rollout or a
   validation step. Closing the incident is part of the lesson.
5. **Diagnose.** Pick one root cause from four, optionally write the fix note you
   would have left in the ticket.
6. **Debrief.** Score, grade, the optimal command path, the steps you missed, the
   risky calls you made, and a plain-English explanation of what actually
   happened.
7. **Logbook.** History, pass rate, streak, weakest categories, fastest clean
   runs.

A hint costs 6 points. A wrong root cause cannot pass, no matter how fast you
were. Running out of time is not a fail state; it just costs speed points.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 34 engine + scenario contract tests
npm run build    # typecheck, then production bundle
npm run preview  # serve the built bundle
```

Requires Node 20.19+ (Vite 8). No environment variables, no backend.

## What is in the deck

| Incident | Category | Difficulty | Par | The trap |
| --- | --- | --- | --- | --- |
| The volume is full | Linux | Junior | 7:00 | Deleting a log file that a process still holds open |
| The certificate ran out | TLS | Mid | 8:00 | Restarting the app instead of reading the cert |
| The record points at a ghost | Network | Mid | 8:00 | Trusting `dig` and never proving the app is healthy |
| No room inside the box | Linux | Mid | 9:00 | Restarting nginx while the upstream keeps getting OOM-killed |
| The pod cannot find the database | Kubernetes | Mid | 7:00 | Editing the Dockerfile instead of the missing secret |
| The job that started twice | Linux | Mid | 9:00 | Killing renderers without removing the duplicate cron entry |
| The door closed behind you | Access | Mid | 7:00 | Locking yourself out with a broken `sshd_config` |
| The database is full of someone else's work | Database | Senior | 10:00 | Killing everything instead of the one runaway query |

## How it works

```
src/
  engine/            pure simulation, no React
    types.ts         World, Scenario, Rule, CommandStep, scoring contracts
    shell.ts         tokenizer, 34 builtins, rule resolution, tab completion
    scoring.ts       coverage, speed, safety, hint penalties, grades
  scenarios/         one file per incident + registry + contract tests
  features/
    home/            spin lever, filters, deck
    run/             alert, terminal, side panel, diagnosis form, run controller
    debrief/         score breakdown, senior replay, explanation
    progress/        run history, weak spots, best times
  app/router.ts      hash routing: #/, #/incident/:id, #/debrief/:id, #/progress
  shared/            site chrome, formatters
```

Design rules that keep the thing honest:

- **The engine is pure.** `execute(scenario, world, command)` clones the world,
  resolves one command and returns new lines plus a new world. No React, no DOM,
  no timers. That is why the whole deck can be replayed in tests.
- **State is the simulation.** Files, services, ports, processes, containers,
  pods, disk, memory and `flags` all live in `World`. A fix is a mutation, not a
  scripted cutscene.
- **Resolution order** is scenario rules → builtins → command-not-found. A
  scenario can override `df -h` without forking the shell.
- **Nothing crashes on a typo.** Unknown commands print a shell-style
  `command not found`, and every command is recorded for scoring.

### Scoring

| Bucket | Max | How it is earned |
| --- | --- | --- |
| Correctness | 40 | Root cause matches. All or nothing. |
| Investigation | 30 | Weighted coverage of `goodSteps`. |
| Speed | 15 | Full marks at par, sliding to zero at 3× par. |
| Safety | 15 | Starts full; each distinct `badAction` costs its penalty. |
| Hints | −6 each | One per run. |

A run passes at 60+ **and** a correct root cause. A wrong call is capped at grade
D.

### Persistence

- `localStorage["runbook-roulette.runs.v1"]` — the logbook (last runs, pass rate,
  streak, weak categories).
- `sessionStorage` — the flattened debrief for the current run, so refreshing the
  debrief page does not lose the result. Refreshing mid-incident starts a clean
  run on the same route.

## Add a scenario in under 30 minutes

The UI never changes. A scenario is one data file, one registry line, and a
passing contract test.

### 1. Copy the shape

Create `src/scenarios/my-incident.ts`:

```ts
import type { Scenario, World } from "../engine/types";

const CONFIG = "/etc/myapp/config.yml";
const broken = (world: World) => /replicas:\s*0/.test(world.files[CONFIG] ?? "");

export const myIncident: Scenario = {
  id: "my-incident",                  // url-safe, unique, stable
  title: "The thing that fell over",  // shown on the deck and debrief
  category: "linux",
  difficulty: "mid",
  parSeconds: 480,

  alert: {
    service: "myapp-01",
    severity: "P2",
    symptom: "checkout is slow for some users",  // vague on purpose
    at: "03:18",
  },

  hostname: "myapp-01",
  user: "ops",
  banner: ["Ubuntu 24.04.1 LTS", "", "Last login: Sat Oct 31 03:11:52 2026"],

  rootCauseId: "replicas-zero",
  rootCauseSummary: "Two sentences a senior engineer would say out loud.",

  options: [
    { id: "replicas-zero", label: "Config sets replicas to 0", detail: "Why it fits." },
    { id: "red-herring-1", label: "...", detail: "What would disprove it." },
    { id: "red-herring-2", label: "...", detail: "What would disprove it." },
    { id: "red-herring-3", label: "...", detail: "What would disprove it." },
  ],

  goodSteps: [
    {
      id: "read-config",
      label: "Read the app config",
      command: `cat ${CONFIG}`,
      match: new RegExp(`^(cat|less|grep)\\s+.*${CONFIG}`), // optional
      weight: 2,                                           // optional, default 1
    },
    {
      id: "fix-config",
      label: "Restore the replica count",
      command: `sed -i 's/replicas: 0/replicas: 3/' ${CONFIG}`,
      weight: 3,
    },
  ],

  badActions: [
    {
      id: "restart-everything",
      label: "Restarted the host",
      pattern: /^(reboot|shutdown)/,
      penalty: 12,
      why: "The config is on disk; a reboot brings the same zero back after a longer outage.",
    },
  ],

  hint: "Read the config before touching the service.",

  files: {
    [CONFIG]: ["replicas: 0", "image: myapp:1.4.2"].join("\n"),
  },

  seed: (world) => {
    world.services = {
      myapp: { name: "myapp", active: true, description: "My app", log: "started" },
    };
    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
    ];
  },

  rules: [
    {
      pattern: /^curl\b.*localhost:8080\/health/,
      output: (ctx) =>
        broken(ctx.world) ? "503 service unavailable: no replicas" : "200 OK",
    },
  ],

  // Healthy again only after the edit AND a reload that actually picks it up.
  isFixed: (world) => !broken(world) && Boolean(world.flags.appReloaded),

  seniorReplay: [
    `cat ${CONFIG}`,
    `sed -i 's/replicas: 0/replicas: 3/' ${CONFIG}`,
    "systemctl reload myapp",
  ],

  debrief: {
    whatHappened: "Plain English, no jargon walls.",
    howToFix: "The shortest correct sequence.",
    prevention: "The change that stops it happening again.",
  },
};
```

If a fix needs to be gated on a reload (most do), set a flag in the rule that
performs it:

```ts
{
  pattern: /^systemctl\s+reload\s+myapp/,
  output: "Reloaded.",
  mutate: (world) => {
    world.flags.appReloaded = true;
    world.fixed = true;
  },
}
```

### 2. Register it

`src/scenarios/index.ts`:

```ts
import { myIncident } from "./my-incident";

export const scenarios: Scenario[] = [
  /* ... */
  myIncident,
];
```

Category and difficulty filters pick it up automatically.

### 3. Make the tests prove it

`npm test` runs a shared contract: every `seniorReplay` must leave
`world.fixed === true`, and `rootCauseId` must be one of the four options. If
that fails, the scenario is not solvable. Add one trap test next to the others in
`src/scenarios/scenarios.test.ts`:

```ts
describe("my-incident", () => {
  it("does not count an edit as fixed before the reload", () => {
    let world = createWorld(myIncident);
    world = execute(myIncident, world, `sed -i 's/replicas: 0/replicas: 3/' ${CONFIG}`).world;
    expect(world.fixed).toBe(false);
  });

  it("flags a reboot as unsafe", () => {
    expect(execute(myIncident, createWorld(myIncident), "reboot").badId).toBe("restart-everything");
  });
});
```

### 4. Play it once

`npm run dev`, then `#/incident/my-incident` directly. Check, in order:

- Every command in `seniorReplay` produces believable output and the header flips
  to `SERVICE HEALTHY` at the last one.
- The alert does not leak the root cause, and exactly one option is right.
- A wrong-but-plausible path (restart the service, delete a log, kill every
  process) is either useless or penalised — never magically fixes it.
- `hint` names the first move, not the answer.
- Every wrong option has a `detail` that explains how you would rule it out.

### Checklist

- [ ] `id` is unique and URL-safe
- [ ] Four options, `rootCauseId` among them
- [ ] `goodSteps` only include steps that change your understanding or the box
- [ ] `badActions` cover the tempting destructive move, with a real `why`
- [ ] `seniorReplay` fixes the incident from a cold start
- [ ] `isFixed` requires the full fix, not just the edit
- [ ] `debrief` explains the cause without assuming the reader saw the terminal
- [ ] `npm test && npm run build` are green

## Command support

The shell understands the commands this job actually needs:

```
ls  cd  pwd  cat  tail  head  grep  wc  du  df  free  ps  top  uptime  uname
systemctl status|restart|reload|is-active   journalctl -u
ss  netstat  curl  dig  ping  nginx -t
docker ps|logs   kubectl get|describe|logs
sed -i  kill  rm  truncate  touch  mkdir  history  date  hostname  whoami  sudo
```

Scenario rules can add domain commands or make an existing one smarter: `openssl
s_client` and `openssl x509` are answered by the TLS scenario, `named-checkzone`
by the DNS one, and `psql` by the database one. Tab completes commands,
services, containers, pods and files; a second Tab moves focus into the
suggestion row, and Escape leaves the terminal. Arrow keys recall history. Every
unknown command is a normal `command not found`, never a crash.

## Design and accessibility

Night-shift ops room meets arcade cabinet: cream `#EDE8DC`, ink `#1C1B22`,
amber `#FFB400`, violet `#6C3DF4`, thick borders, hard offset shadows, Space
Grotesk and JetBrains Mono. No gradients, no glassmorphism.

Accessibility is treated as part of the product, not a QA pass:

- Native semantics first: real links for navigation and deck cards, a real `<ul>`
  deck with each card's title as its link, and a heading hierarchy that survives
  an accessibility-tree dump. Nothing clickable is a `div`.
- Skip link, `main#main-content`, focus moved to each route's `h1`, and
  `aria-current="page"` on the active nav link.
- No keyboard trap: the terminal takes Tab completion only while there is text
  to complete; Shift+Tab and Escape always leave; suggestion chips are
  reachable and announce themselves.
- Scrolling regions (terminal output, command timelines) are focusable.
- Form errors are announced inline instead of disabling the submit button; a
  failed submit marks the radios `aria-invalid`, focuses the first option, and
  the chosen option gets a check glyph rather than colour alone.
- Hints move focus to the revealed text so it is not silently inserted above.
- WCAG AA contrast on all text, visible focus rings on dark surfaces, 24px
  minimum targets, `prefers-reduced-motion`, and a `forced-colors` block so
  selected chips, the active nav link and panel borders stay visible in Windows
  High Contrast.
- Type is sized in `rem` and layouts use `rem`-based flex bases and `auto-fit`
  grids, so 200% text sizing wraps the hero and stats instead of clipping them;
  no horizontal scrolling at 320px, 200% zoom, or a 32px root font size.
- Audited with axe-core (0 violations on home, incident, hint, debrief and
  progress) plus manual keyboard, forced-colors and text-resize passes.

## Licence

No licence file yet — this is a personal project. Ask before commercial use.
