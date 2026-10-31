/**
 * Scenario 5 — CrashLoopBackOff from a wrong environment value.
 *
 * Teaching goal: a crash loop is a configuration question before it is a
 * Kubernetes question. The pod is being rescheduled correctly; every new
 * container reads the same bad DB_HOST and dies in the same place. Deleting
 * pods or restarting the rollout only buys another crash.
 *
 * State is real: fixing the Deployment env changes the pod to Running, and the
 * rollout status refuses to report success until the fix is in place.
 */

import type { Scenario } from "../engine/types";

const POD = "api-7d9f4c8b6-2xk9p";

const describePod = (fixed: boolean) =>
  [
    `Name:             ${POD}`,
    "Namespace:        shop",
    "Priority:         0",
    "Service Account:  api",
    "Node:             node-2/10.0.0.22",
    "Start Time:       Sat, 31 Oct 2026 03:02:14 +0000",
    "Labels:           app=api",
    "                  pod-template-hash=7d9f4c8b6",
    "Status:           Running",
    "IP:               10.244.2.19",
    "Controlled By:    ReplicaSet/api-7d9f4c8b6",
    "Containers:",
    "  api:",
    "    Image:          registry.shop.example/checkout-api:1.4.2",
    fixed
      ? "    State:          Running"
      : ["    State:          Waiting", "      Reason:       CrashLoopBackOff"].join("\n"),
    fixed
      ? "    Ready:          True"
      : ["    Last State:     Terminated", "      Reason:       Error", "      Exit Code:    1", "    Ready:          False"].join("\n"),
    `    Restart Count:  ${fixed ? 8 : 7}`,
    "    Environment:",
    `      DB_HOST:      ${fixed ? "postgres-svc" : "postgres-svvc"}`,
    "      DB_PORT:      5432",
    "      NODE_ENV:     production",
    "Conditions:",
    "  Type              Status",
    `  Ready             ${fixed ? "True" : "False"}`,
    "Events:",
    "  Type     Reason     Age   From     Message",
    "  ----     ------     ----  ----     -------",
    fixed
      ? "  Normal   Started    10s   kubelet  Started container api"
      : "  Warning  BackOff    2m    kubelet  Back-off restarting failed container api",
  ].join("\n");

const healthyLog = [
  "> checkout-api@1.4.2 start",
  "> node dist/server.js",
  "",
  "listening on :3000",
  "connected to postgres-svc:5432",
].join("\n");

const crashLog = [
  "> checkout-api@1.4.2 start",
  "> node dist/server.js",
  "",
  "Error: getaddrinfo ENOTFOUND postgres-svvc",
  "    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:120:17)",
  "    at GetAddrInfoReqWrap.callbackTrampoline (node:internal/async_hooks:130:17) {",
  "  errno: -3008,",
  "  code: 'ENOTFOUND',",
  "  syscall: 'getaddrinfo',",
  "  hostname: 'postgres-svvc'",
  "}",
  "",
  "npm notice process exited with code 1",
].join("\n");

export const crashLoopEnv: Scenario = {
  id: "crashloop-env",
  title: "The pod cannot find the database",
  category: "orchestration",
  difficulty: "mid",
  parSeconds: 420,

  alert: {
    service: "shop/api",
    severity: "P1",
    symptom: "api pods are in CrashLoopBackOff and checkout returns 503; the database looks healthy",
    at: "03:02",
  },

  hostname: "k8s-admin",
  user: "ops",
  banner: [
    "kubectl is configured for cluster shop-prod (context shop-prod-admin)",
    "",
    "Last login: Sat Oct 31 02:58:37 2026 from 10.20.4.11",
    "You are one `kubectl apply` away from making this worse.",
  ],

  rootCauseId: "bad-db-host",
  rootCauseSummary:
    "The api Deployment sets DB_HOST to postgres-svvc, a DNS name that does not exist. The Service is postgres-svc. Every new container exits with ENOTFOUND before it can listen, so Kubernetes correctly restarts it into CrashLoopBackOff. Postgres itself is running and reachable.",
  options: [
    {
      id: "bad-db-host",
      label: "DB_HOST is set to postgres-svvc; the Service is actually postgres-svc",
      detail: "The crash log names the hostname, and the Deployment env confirms the typo.",
    },
    {
      id: "postgres-down",
      label: "The postgres pod is down, so the API cannot connect",
      detail: "Would show a Running postgres pod and connection-refused errors, not ENOTFOUND.",
    },
    {
      id: "image-pull",
      label: "The image cannot be pulled because the registry credential is missing",
      detail: "Would show ImagePullBackOff or ErrImagePull, not an application exit code.",
    },
    {
      id: "probe-too-strict",
      label: "The readiness probe is too aggressive and kills an otherwise healthy pod",
      detail: "A probe failure does not produce an application stack trace and exit code 1.",
    },
  ],

  goodSteps: [
    {
      id: "get-pods",
      label: "See which pod is actually failing",
      command: "kubectl get pods",
      match: /^kubectl\s+get\s+pods?\b/,
      weight: 2,
    },
    {
      id: "logs",
      label: "Read the crashing container's log",
      command: `kubectl logs ${POD}`,
      match: /^kubectl\s+logs\s+api-/,
      weight: 2,
    },
    {
      id: "describe",
      label: "Read the pod events and environment",
      command: `kubectl describe pod ${POD}`,
      match: /^kubectl\s+describe\s+pods?\s+api-/,
      weight: 2,
    },
    {
      id: "deployment",
      label: "Inspect the Deployment spec that produced the pod",
      command: "kubectl get deployment api -o yaml",
      match: /^kubectl\s+get\s+(deploy|deployment)\b.*\bapi\b/,
      weight: 2,
    },
    {
      id: "service",
      label: "Confirm the real database Service name",
      command: "kubectl get svc postgres-svc",
      match: /^kubectl\s+get\s+(svc|service)\b.*postgres-svc/,
      weight: 2,
    },
    {
      id: "fix-env",
      label: "Correct DB_HOST on the Deployment",
      command: "kubectl set env deployment/api DB_HOST=postgres-svc",
      match: /^kubectl\s+set\s+env\s+(?:deployment|deploy)(?:\/|\s+)api\s+DB_HOST=postgres-svc$/,
      weight: 3,
    },
    {
      id: "rollout",
      label: "Wait for the rollout instead of assuming it worked",
      command: "kubectl rollout status deployment/api",
      match: /^kubectl\s+rollout\s+status\s+(?:deployment|deploy)(?:\/|\s+)api/,
      weight: 2,
    },
    {
      id: "verify",
      label: "Confirm the pod is Running and Ready",
      command: "kubectl get pods -o wide",
      match: /^kubectl\s+get\s+pods?\b.*-o\s+wide/,
      weight: 1,
    },
  ],

  badActions: [
    {
      id: "delete-pod",
      label: "Deleted the crashing pod",
      pattern: /^kubectl\s+delete\s+pod/,
      penalty: 4,
      why: "The ReplicaSet replaces it immediately, and the replacement reads the same bad DB_HOST.",
    },
    {
      id: "rollout-restart",
      label: "Restarted the rollout without changing anything",
      pattern: /^kubectl\s+rollout\s+restart/,
      penalty: 4,
      why: "A rollout restart replaces pods with identical configuration. Same crash, new names.",
    },
    {
      id: "scale-zero",
      label: "Scaled the Deployment to zero",
      pattern: /^kubectl\s+scale\s+deployment\/?api\b.*--replicas=0/,
      penalty: 10,
      why: "Now checkout is definitely down, and you still have not read the environment variable.",
    },
    {
      id: "delete-deployment",
      label: "Deleted the Deployment",
      pattern: /^kubectl\s+delete\s+deployment/,
      penalty: 15,
      why: "You remove the spec, the rollout history, and the easy path back. This turns a typo into a rebuild.",
    },
  ],

  hint: "Read the crash log, not the pod status: `kubectl logs` names the hostname it cannot resolve. Then compare that name with `kubectl get svc`.",

  files: {
    "/home/ops/kubeconfig-note.txt": [
      "context: shop-prod-admin",
      "namespace: shop",
      "",
      "Reminder: the Service is postgres-svc, not postgres (that is the old namespace).",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 40;
    world.diskUsedGb = 9.6;
    world.memTotalMb = 8192;
    world.memUsedMb = 2400;

    world.services = {
      kubelet: { name: "kubelet", active: true, description: "kubelet: The Kubernetes Node Agent", log: "Started kubelet." },
      containerd: { name: "containerd", active: true, description: "containerd container runtime", log: "containerd started" },
    };

    world.pods = [
      {
        name: POD,
        ready: "0/1",
        status: "CrashLoopBackOff",
        restarts: 7,
        age: "6m",
        log: crashLog,
        describe: describePod(false),
      },
      {
        name: "postgres-0",
        ready: "1/1",
        status: "Running",
        restarts: 0,
        age: "31d",
        log: [
          "2026-10-31 03:01:58.114 UTC [1] LOG:  database system is ready to accept connections",
          "2026-10-31 03:02:01.882 UTC [118] LOG:  connection received: host=10.244.2.19",
        ].join("\n"),
        describe: [
          "Name:             postgres-0",
          "Namespace:        shop",
          "Status:           Running",
          "Containers:",
          "  postgres:",
          "    State:          Running",
          "    Ready:          True",
          "    Restart Count:  0",
        ].join("\n"),
      },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 902, user: "root", cpu: 1.2, mem: 1.8, command: "kubelet --config=/var/lib/kubelet/config.yaml" },
      { pid: 944, user: "root", cpu: 0.8, mem: 1.1, command: "containerd" },
    ];
  },

  rules: [
    {
      pattern: /^kubectl\s+get\s+(deploy|deployment)\s+api\b/,
      output: (ctx) => {
        const fixed = Boolean(ctx.world.flags.envFixed);
        return [
          "apiVersion: apps/v1",
          "kind: Deployment",
          "metadata:",
          "  name: api",
          "  namespace: shop",
          "spec:",
          "  replicas: 1",
          "  selector:",
          "    matchLabels:",
          "      app: api",
          "  template:",
          "    metadata:",
          "      labels:",
          "        app: api",
          "    spec:",
          "      containers:",
          "      - name: api",
          "        image: registry.shop.example/checkout-api:1.4.2",
          "        env:",
          "        - name: DB_HOST",
          `          value: ${fixed ? "postgres-svc" : "postgres-svvc"}`,
          "        - name: DB_PORT",
          "          value: \"5432\"",
          "        - name: NODE_ENV",
          "          value: production",
          "        ports:",
          "        - containerPort: 3000",
        ].join("\n");
      },
    },

    {
      pattern: /^kubectl\s+get\s+(svc|service)\b/,
      output: [
        "NAME           TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)    AGE",
        "postgres-svc   ClusterIP   10.96.0.14    <none>        5432/TCP   31d",
      ].join("\n"),
    },

    {
      pattern: /^kubectl\s+set\s+env\s+(?:deployment|deploy)(?:\/|\s+)api\s+DB_HOST=postgres-svc$/,
      output: "deployment.apps/api env updated",
      mutate: (world) => {
        world.flags.envFixed = true;
        const pod = world.pods.find((entry) => entry.name === POD);
        if (pod) {
          pod.ready = "1/1";
          pod.status = "Running";
          pod.restarts += 1;
          pod.log = healthyLog;
          pod.describe = describePod(true);
        }
      },
    },

    {
      pattern: /^kubectl\s+set\s+env\b/,
      output: [
        "deployment.apps/api env updated",
        "Warning: the new value still does not match any Service in namespace shop.",
        "The pod will crash with ENOTFOUND again.",
      ].join("\n"),
      asError: true,
    },

    {
      pattern: /^kubectl\s+rollout\s+status\s+(?:deployment|deploy)(?:\/|\s+)api/,
      when: (world) => Boolean(world.flags.envFixed),
      output: "deployment \"api\" successfully rolled out",
      mutate: (world) => {
        world.flags.rolloutComplete = true;
      },
    },
    {
      pattern: /^kubectl\s+rollout\s+status\s+(?:deployment|deploy)(?:\/|\s+)api/,
      output: "Waiting for deployment \"api\" rollout to finish: 0 of 1 updated replicas are available...",
      asError: true,
    },

    {
      pattern: /^kubectl\s+delete\s+pod\b/,
      output: [
        `pod "${POD}" deleted`,
        "replicaset/api-7d9f4c8b6 created a replacement pod with the same template.",
      ].join("\n"),
    },

    {
      pattern: /^kubectl\s+rollout\s+restart\b/,
      output: "deployment.apps/api restarted — no configuration changed",
    },

    {
      pattern: /^kubectl\s+scale\s+deployment\/?api\b/,
      output: "deployment.apps/api scaled",
    },

    {
      pattern: /^kubectl\s+delete\s+deployment\b/,
      output: "deployment.apps \"api\" deleted — checkout has no backing workload",
      asError: true,
    },
  ],

  isFixed: (world) => Boolean(world.flags.envFixed && world.flags.rolloutComplete),

  seniorReplay: [
    "kubectl get pods",
    `kubectl logs ${POD}`,
    `kubectl describe pod ${POD}`,
    "kubectl get deployment api -o yaml",
    "kubectl get svc postgres-svc",
    "kubectl set env deployment/api DB_HOST=postgres-svc",
    "kubectl rollout status deployment/api",
    "kubectl get pods -o wide",
  ],

  debrief: {
    whatHappened:
      "A config change on the api Deployment set DB_HOST to postgres-svvc. The Service in namespace shop is postgres-svc, so the name does not resolve at all. The container starts, joins the network, tries to resolve the database hostname, gets ENOTFOUND, and exits with code 1 before it ever listens on 3000. The ReplicaSet does exactly what it should: it creates another pod, which reads the same environment and crashes the same way. Back-off grows until the pod sits in CrashLoopBackOff. Postgres was Running with zero restarts the whole time; nothing was wrong with the database.",
    howToFix:
      "Correct the environment on the Deployment, then wait for the rollout. `kubectl set env deployment/api DB_HOST=postgres-svc`, `kubectl rollout status deployment/api`, and confirm the new pod is 1/1 Running. The pod-level fixes — deleting the pod, restarting the rollout — all replace the container without touching the template, so they reproduce the crash. If the value came from a Secret or ConfigMap, fix the source object instead, or the next rollout will reintroduce the typo.",
    prevention:
      "Validate environment references in CI: every DB_HOST, queue URL, and secret key in a Deployment should resolve in the target namespace before merge. Add a post-deploy check that waits for rollout health instead of assuming `apply` means success. Alert on CrashLoopBackOff rate as well as HTTP 5xx, so the pod, not just the symptom, shows up on the dashboard.",
  },
};
