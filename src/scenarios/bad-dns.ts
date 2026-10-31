/**
 * Scenario 3 — Bad DNS A record.
 *
 * Teaching goal: "the site is down" is not the same as "the app is down". The
 * zone points checkout at a host that was decommissioned two days ago. The app
 * on the new edge node is healthy the whole time — `curl --resolve` proves it
 * before you touch DNS.
 *
 * State is real: editing the zone changes what `dig` returns only after the
 * authoritative server reloads, which is exactly the mistake people make.
 */

import type { Scenario, World } from "../engine/types";

const ZONE = "/etc/bind/zones/db.shop.example";
const OLD_IP = "10.0.0.99";
const EDGE_IP = "10.0.0.12";

const zoneFixed = (world: World) =>
  /^\s*checkout\s+IN\s+A\s+10\.0\.0\.12\s*$/m.test(world.files[ZONE] ?? "");
const dnsLive = (world: World) => zoneFixed(world) && Boolean(world.flags.dnsLoadedFixed);

export const badDns: Scenario = {
  id: "bad-dns",
  title: "The record points at a ghost",
  category: "network",
  difficulty: "mid",
  parSeconds: 480,

  alert: {
    service: "edge-dns-01",
    severity: "P1",
    symptom: "checkout.shop.example failing for most users; the new edge node says it is healthy",
    at: "03:26",
  },

  hostname: "edge-dns-01",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 03:11:52 2026 from 10.20.4.11",
    "You are on the authoritative DNS host. Changes here are live.",
  ],

  rootCauseId: "stale-a-record",
  rootCauseSummary:
    "checkout.shop.example still has an A record for 10.0.0.99, an edge node that was decommissioned two days earlier. The replacement node is 10.0.0.12 and has been serving traffic correctly the whole time. Users resolved to a powered-off host and timed out.",
  options: [
    {
      id: "stale-a-record",
      label: "checkout.shop.example points at 10.0.0.99, a host decommissioned two days ago",
      detail: "A direct request to 10.0.0.12 works while the hostname times out.",
    },
    {
      id: "new-edge-down",
      label: "The new edge node at 10.0.0.12 has stopped serving checkout",
      detail: "Would fail even when the request bypasses DNS with --resolve.",
    },
    {
      id: "ttl-propagation",
      label: "The public resolver simply has not picked up a correctly published record yet",
      detail: "Would show the right record on the authoritative server but a stale answer upstream.",
    },
    {
      id: "firewall-80",
      label: "A firewall rule is dropping inbound traffic on port 80 at the new edge",
      detail: "Would time out for direct-IP requests too.",
    },
  ],

  goodSteps: [
    {
      id: "dig-checkout",
      label: "Resolve the hostname and read the actual A record",
      command: "dig checkout.shop.example",
      match: /^dig\b.*checkout\.shop\.example/,
      weight: 2,
    },
    {
      id: "read-zone",
      label: "Open the authoritative zone file",
      command: "cat /etc/bind/zones/db.shop.example",
      match: /^(cat|grep|less|tail)\s+.*db\.shop\.example/,
      weight: 2,
    },
    {
      id: "deploy-log",
      label: "Find the change that retired the old host",
      command: "cat /var/log/deploy/deploy.log",
      match: /^(cat|grep|less|tail)\s+.*deploy\.log/,
      weight: 2,
    },
    {
      id: "ping-checkout",
      label: "Confirm the resolved address is unreachable",
      command: "ping -c 2 checkout.shop.example",
      match: /^ping\b.*checkout/,
      weight: 1,
    },
    {
      id: "bypass-dns",
      label: "Prove the service is healthy by bypassing DNS",
      command: "curl -I --resolve checkout.shop.example:80:10.0.0.12 http://checkout.shop.example/",
      match: /^curl\b.*--resolve\b.*checkout\.shop\.example:80:10\.0\.0\.12/,
      weight: 3,
    },
    {
      id: "fix-record",
      label: "Correct the A record to the live edge node",
      command: "sed -i 's/10.0.0.99/10.0.0.12/' /etc/bind/zones/db.shop.example",
      match: /^sed\s+-i\b.*db\.shop\.example/,
      weight: 3,
    },
    {
      id: "validate-zone",
      label: "Validate the edited zone before serving it",
      command: "named-checkzone shop.example /etc/bind/zones/db.shop.example",
      match: /^named-checkzone\b/,
      weight: 1,
    },
    {
      id: "reload-bind",
      label: "Reload the authoritative server so the edit takes effect",
      command: "rndc reload",
      match: /^(rndc\s+reload|systemctl\s+(reload|restart)\s+(bind9|named))/,
      weight: 2,
    },
    {
      id: "verify-dns",
      label: "Verify the record now resolves to the right address",
      command: "dig +short checkout.shop.example",
      match: /^dig\s+\+short\b.*checkout/,
      weight: 2,
    },
  ],

  badActions: [
    {
      id: "restart-nginx",
      label: "Restarted nginx to fix a name-resolution problem",
      pattern: /^systemctl\s+restart\s+nginx/,
      penalty: 5,
      why: "nginx is not even the broken component here, and a restart cannot change an A record.",
    },
    {
      id: "delete-zone",
      label: "Deleted the DNS zone directory",
      pattern: /^rm\s+-[rf]*\s+\/etc\/bind/,
      penalty: 15,
      why: "Every name served by this host disappears. You have turned one broken checkout into a site-wide outage.",
    },
    {
      id: "stop-bind",
      label: "Stopped the authoritative name server",
      pattern: /^systemctl\s+stop\s+(bind9|named)/,
      penalty: 12,
      why: "Stopping DNS does not fix a bad record; it makes the zone unavailable entirely.",
    },
    {
      id: "reboot",
      label: "Rebooted the DNS host",
      pattern: /^(reboot|shutdown|init\s+6)/,
      penalty: 12,
      why: "The bad record is persisted on disk. A reboot brings the same stale answer back after a longer outage.",
    },
  ],

  hint: "Resolve the name and then bypass it: `dig checkout.shop.example`, then `curl --resolve` straight to the live edge IP. If the direct request works, DNS is the liar.",

  files: {
    [ZONE]: [
      "$TTL 300",
      "@   IN SOA ns1.shop.example. hostmaster.shop.example. (",
      "        2026103001 ; serial",
      "        3600       ; refresh",
      "        900        ; retry",
      "        604800     ; expire",
      "        300 )      ; minimum",
      "",
      "@               IN NS  ns1.shop.example.",
      "ns1             IN A   10.0.0.53",
      "api             IN A   10.0.0.12",
      "checkout        IN A   10.0.0.99",
      "",
      "; edge-03 (10.0.0.99) was drained on 2026-10-29.",
      "; checkout was never moved to edge-04 (10.0.0.12).",
    ].join("\n"),

    "/etc/bind/named.conf.local": [
      "zone \"shop.example\" {",
      "    type master;",
      "    file \"/etc/bind/zones/db.shop.example\";",
      "};",
    ].join("\n"),

    "/var/log/deploy/deploy.log": [
      "2026-10-29 22:14:03 decommission: edge-03 (10.0.0.99) drained and powered off",
      "2026-10-29 22:14:04 dns: follow-up required - checkout.shop.example still points at edge-03",
      "2026-10-29 22:19:51 traffic: edge-04 (10.0.0.12) accepted 100% of direct health checks",
      "2026-10-30 09:02:11 change: CHG-4412 approved for 2026-10-31 03:00 (not executed)",
      "2026-10-31 02:57:40 alert: checkout.shop.example connection timeouts above 5%",
    ].join("\n"),

    "/var/log/syslog": [
      "Oct 31 03:04:18 edge-dns-01 named[812]: zone shop.example/IN: loaded serial 2026103001",
      "Oct 31 03:21:02 edge-dns-01 named[812]: client 10.20.4.11#51222: query: checkout.shop.example IN A + (10.20.4.11)",
      "Oct 31 03:21:02 edge-dns-01 named[812]: client 10.20.4.11#51222: answer: checkout.shop.example IN A 10.0.0.99",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 40;
    world.diskUsedGb = 14.2;
    world.memTotalMb = 4096;
    world.memUsedMb = 1620;

    world.services = {
      bind9: {
        name: "bind9",
        active: true,
        description: "BIND Domain Name Server",
        log: [
          "Starting BIND 9.18.24",
          "zone shop.example/IN: loaded serial 2026103001",
          "running",
        ].join("\n"),
      },
      sshd: { name: "sshd", active: true, description: "OpenBSD Secure Shell server", log: "Server listening on 0.0.0.0 port 22." },
      cron: { name: "cron", active: true, description: "Regular background program processing daemon", log: "session opened for user root" },
    };

    world.ports = [
      { proto: "tcp", local: "0.0.0.0:22", process: "sshd" },
      { proto: "tcp", local: "10.0.0.53:53", process: "named" },
      { proto: "udp", local: "10.0.0.53:53", process: "named" },
      { proto: "tcp", local: "127.0.0.1:953", process: "named" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 812, user: "bind", cpu: 0.3, mem: 0.9, command: "/usr/sbin/named -f -u bind" },
    ];
  },

  rules: [
    /* --- dig reads the zone, but only after a reload ----------------- */
    {
      pattern: /^dig\s+\+short\b.*checkout\.shop\.example/,
      output: (ctx) => (dnsLive(ctx.world) ? EDGE_IP : OLD_IP),
    },
    {
      pattern: /^dig\s+\+short\b.*api\.shop\.example/,
      output: EDGE_IP,
    },
    {
      pattern: /^dig\b.*api\.shop\.example/,
      output: [
        "; <<>> DiG 9.18.24 <<>> api.shop.example",
        ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 39811",
        ";; QUESTION SECTION:",
        ";api.shop.example.\t\tIN\tA",
        "",
        ";; ANSWER SECTION:",
        "api.shop.example.\t300\tIN\tA\t10.0.0.12",
      ].join("\n"),
    },
    {
      pattern: /^dig\b.*checkout\.shop\.example/,
      output: (ctx) => {
        const address = dnsLive(ctx.world) ? EDGE_IP : OLD_IP;
        return [
          "; <<>> DiG 9.18.24 <<>> checkout.shop.example",
          ";; global options: +cmd",
          ";; Got answer:",
          ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 51231",
          ";; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 1, ADDITIONAL: 1",
          "",
          ";; QUESTION SECTION:",
          ";checkout.shop.example.\t\tIN\tA",
          "",
          ";; ANSWER SECTION:",
          `checkout.shop.example.\t300\tIN\tA\t${address}`,
          "",
          ";; Query time: 1 msec",
          ";; SERVER: 127.0.0.1#53(127.0.0.1) (UDP)",
          `;; WHEN: Sat Oct 31 03:${dnsLive(ctx.world) ? "29" : "26"}:41 UTC 2026`,
          ";; MSG SIZE  rcvd: 61",
        ].join("\n");
      },
    },

    /* --- bypassing DNS is the decisive experiment -------------------- */
    {
      pattern: /^curl\b.*--resolve\b.*checkout\.shop\.example:80:10\.0\.0\.12/,
      output: ["HTTP/1.1 200 OK", "Server: nginx/1.24.0", "Content-Type: text/html", "", "<html>checkout ok</html>"].join("\n"),
    },

    {
      pattern: /^curl\b.*checkout\.shop\.example/,
      output: (ctx) =>
        dnsLive(ctx.world)
          ? ["HTTP/1.1 200 OK", "Server: nginx/1.24.0", "Content-Type: text/html", "", "<html>checkout ok</html>"].join("\n")
          : [
              "curl: (28) Failed to connect to checkout.shop.example port 80 after 5001 ms: Timeout was reached",
            ].join("\n"),
      asError: true,
    },

    {
      pattern: /^ping\b.*checkout\.shop\.example/,
      output: (ctx) =>
        dnsLive(ctx.world)
          ? [
              "PING checkout.shop.example (10.0.0.12) 56(84) bytes of data.",
              "64 bytes from 10.0.0.12: icmp_seq=1 ttl=57 time=9.4 ms",
              "64 bytes from 10.0.0.12: icmp_seq=2 ttl=57 time=9.1 ms",
              "",
              "--- checkout.shop.example ping statistics ---",
              "2 packets transmitted, 2 received, 0% packet loss, time 1001ms",
            ].join("\n")
          : [
              "PING checkout.shop.example (10.0.0.99) 56(84) bytes of data.",
              "",
              "--- checkout.shop.example ping statistics ---",
              "2 packets transmitted, 0 received, 100% packet loss, time 1005ms",
            ].join("\n"),
    },

    /* --- zone validation and reload --------------------------------- */
    {
      pattern: /^named-checkzone\b/,
      output: (ctx) =>
        [
          `zone shop.example/IN: loaded serial ${zoneFixed(ctx.world) ? "2026103101" : "2026103001"}`,
          "OK",
        ].join("\n"),
    },
    {
      pattern: /^rndc\s+reload/,
      output: "server reload successful",
      mutate: (world) => {
        // Snapshot what the server just loaded. Reloading before editing the
        // zone leaves the stale answer in memory, which is the whole trap.
        world.flags.dnsLoadedFixed = zoneFixed(world);
      },
    },
    {
      pattern: /^systemctl\s+(reload|restart)\s+(bind9|named)$/,
      output: "Job for bind9.service completed successfully.",
      mutate: (world) => {
        world.flags.dnsLoadedFixed = zoneFixed(world);
      },
    },

    {
      pattern: /^ss\s+-tlnp$/,
      output: [
        "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
        "LISTEN 0      4096    10.0.0.53:53         0.0.0.0:*     users:((\"named\",pid=812,fd=21))",
        "LISTEN 0      128      0.0.0.0:22         0.0.0.0:*     users:((\"sshd\",pid=701,fd=3))",
      ].join("\n"),
    },
  ],

  isFixed: dnsLive,

  seniorReplay: [
    "dig checkout.shop.example",
    "cat /var/log/deploy/deploy.log",
    "cat /etc/bind/zones/db.shop.example",
    "curl -I --resolve checkout.shop.example:80:10.0.0.12 http://checkout.shop.example/",
    "sed -i 's/10.0.0.99/10.0.0.12/' /etc/bind/zones/db.shop.example",
    "named-checkzone shop.example /etc/bind/zones/db.shop.example",
    "rndc reload",
    "dig +short checkout.shop.example",
    "curl -I http://checkout.shop.example",
  ],

  debrief: {
    whatHappened:
      "edge-03 at 10.0.0.99 was drained and powered off during a capacity change on 29 October. Its traffic moved to edge-04 at 10.0.0.12, but the checkout A record was never updated; the deploy log even left a follow-up note that nobody actioned. For two days the old address kept answering because the host was still technically reachable, then it stopped. Every client that resolved checkout.shop.example went to a powered-off machine and timed out. The application itself was healthy the entire time: a request sent straight to 10.0.0.12 returned 200.",
    howToFix:
      "Correct the A record in the authoritative zone, validate it, then reload BIND. `sed -i 's/10.0.0.99/10.0.0.12/' /etc/bind/zones/db.shop.example`, `named-checkzone shop.example /etc/bind/zones/db.shop.example`, `rndc reload`. Editing the file alone changes nothing: the running server keeps its in-memory copy until the reload. Verify with `dig +short` and a real request. Remember that resolvers may cache the old answer for the TTL (300 seconds here).",
    prevention:
      "Make decommissioning a two-step change: drain the host, then move every record that points at it. Add a synthetic check that resolves each public hostname and requests it, so a stale record fails a monitor instead of a customer. Keep TTLs low on records that are about to move, and alert when an A record references an inventory host that is retired.",
  },
};
