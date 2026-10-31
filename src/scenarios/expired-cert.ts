/**
 * Scenario 2 — Expired TLS certificate.
 *
 * Teaching goal: a certificate error is not an nginx problem. The service is
 * healthy, the port is open, the config is valid — the material is stale and
 * automatic renewal silently broke. Restarting does nothing.
 *
 * State is real: `certbot renew` fails until the ACME webroot exists, and
 * `openssl s_client` shows a different expiry once the cert is renewed.
 */

import type { Scenario } from "../engine/types";

const EXPIRED_AT = "Oct 30 21:00:00 2026 GMT";
const RENEWED_AT = "Jan 28 03:11:00 2027 GMT";

export const expiredCert: Scenario = {
  id: "expired-cert",
  title: "The certificate ran out",
  category: "tls",
  difficulty: "mid",
  parSeconds: 480,

  alert: {
    service: "edge-lb-01",
    severity: "P1",
    symptom: "checkout.shop.example failing TLS handshakes; browsers show a certificate warning",
    at: "03:19",
  },

  hostname: "edge-lb-01",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 03:02:44 2026 from 10.20.4.11",
  ],

  rootCauseId: "cert-expired-webroot",
  rootCauseSummary:
    "The Let's Encrypt certificate for checkout.shop.example expired at 21:00 yesterday. Automatic renewal had been failing for weeks because a deploy removed the ACME webroot directory, so the HTTP-01 challenge could never complete.",
  options: [
    {
      id: "cert-expired-webroot",
      label: "The certificate expired and auto-renewal has been failing since the webroot was removed",
      detail: "Expiry is in the past, and certbot's HTTP-01 challenge has nowhere to write its token.",
    },
    {
      id: "nginx-bad-path",
      label: "nginx points at the wrong ssl_certificate path in the server block",
      detail: "Would fail `nginx -t` or log 'cannot load certificate'.",
    },
    {
      id: "firewall-443",
      label: "A firewall rule is dropping inbound traffic on 443",
      detail: "Would time out instead of presenting a certificate.",
    },
    {
      id: "upstream-8443",
      label: "The upstream app is not listening on 8443, so TLS terminates but the proxy fails",
      detail: "Would produce 502s with a valid certificate.",
    },
  ],

  goodSteps: [
    {
      id: "curl-https",
      label: "Reproduce the failure the way a user sees it",
      command: "curl -I https://checkout.shop.example",
      match: /^curl\s+.*https:\/\/checkout\.shop\.example/,
      weight: 2,
    },
    {
      id: "s-client",
      label: "Read the certificate the server actually presents",
      command: "openssl s_client -connect checkout.shop.example:443 -servername checkout.shop.example",
      match: /^openssl\s+s_client/,
      weight: 2,
    },
    {
      id: "x509-dates",
      label: "Confirm the expiry date on the file on disk",
      command: "openssl x509 -in /etc/letsencrypt/live/checkout.shop.example/cert.pem -noout -dates",
      match: /^openssl\s+x509.*(-dates|--dates|enddate)/,
      weight: 2,
    },
    {
      id: "certbot-log",
      label: "Find out why renewal stopped working",
      command: "journalctl -u certbot -n 30",
      match: /^journalctl\s+.*certbot/,
      weight: 2,
    },
    {
      id: "renewal-conf",
      label: "Read the renewal config to see the challenge method",
      command: "cat /etc/letsencrypt/renewal/checkout.shop.example.conf",
      match: /^(cat|grep|less)\s+.*renewal\/checkout\.shop\.example\.conf/,
      weight: 1,
    },
    {
      id: "rule-out-nginx",
      label: "Rule out a config or listener problem",
      command: "nginx -t",
      match: /^(nginx\s+-t|ss\s+-tlnp|systemctl\s+status\s+nginx)/,
      weight: 1,
    },
    {
      id: "restore-webroot",
      label: "Recreate the ACME webroot",
      command: "mkdir -p /var/www/acme-challenge/.well-known/acme-challenge",
      match: /^mkdir\s+-p\s+\/var\/www\/acme-challenge/,
      weight: 2,
    },
    {
      id: "renew",
      label: "Renew the certificate",
      command: "certbot renew --cert-name checkout.shop.example --force-renewal",
      match: /^certbot\s+renew/,
      weight: 3,
    },
    {
      id: "reload",
      label: "Reload nginx to pick up the new certificate",
      command: "systemctl reload nginx",
      match: /^systemctl\s+reload\s+nginx/,
      weight: 2,
    },
  ],

  badActions: [
    {
      id: "restart-first",
      label: "Restarted nginx before checking the certificate",
      pattern: /^systemctl\s+restart\s+nginx/,
      penalty: 5,
      why: "nginx was serving fine. A restart re-reads the same expired file and buys you nothing.",
    },
    {
      id: "delete-letsencrypt",
      label: "Deleted the Let's Encrypt state directory",
      pattern: /^rm\s+-[rf]*\s+\/etc\/letsencrypt/,
      penalty: 15,
      why: "You destroy the account key and every renewal config. Recovery now needs manual re-issuance for every hostname.",
    },
    {
      id: "self-signed",
      label: "Generated a self-signed certificate into the live path",
      pattern: /^openssl\s+req\s+.*-x509/,
      penalty: 10,
      why: "It silences the warning for you and breaks trust for every user. Browser errors get worse, not better.",
    },
    {
      id: "chmod-letsencrypt",
      label: "Opened up permissions on the key material",
      pattern: /^chmod\s+-R\s+777\s+\/etc\/letsencrypt/,
      penalty: 8,
      why: "Private keys readable by every process on the box is a security incident, not a fix.",
    },
    {
      id: "clock-skew",
      label: "Changed the system clock to dodge the expiry",
      pattern: /^date\s+-s/,
      penalty: 10,
      why: "This breaks log ordering, token validation, and every other certificate on the host.",
    },
  ],

  hint: "The service is fine — ask what certificate it is presenting. `openssl s_client` shows the expiry, and `journalctl -u certbot` shows why renewal stopped.",

  files: {
    "/etc/nginx/sites-enabled/checkout": [
      "server {",
      "  listen 443 ssl;",
      "  server_name checkout.shop.example;",
      "",
      "  ssl_certificate     /etc/letsencrypt/live/checkout.shop.example/fullchain.pem;",
      "  ssl_certificate_key /etc/letsencrypt/live/checkout.shop.example/privkey.pem;",
      "",
      "  location /.well-known/acme-challenge/ {",
      "    root /var/www/acme-challenge;",
      "  }",
      "",
      "  location / {",
      "    proxy_pass http://127.0.0.1:8443;",
      "    proxy_set_header Host $host;",
      "  }",
      "}",
    ].join("\n"),

    "/etc/letsencrypt/live/checkout.shop.example/cert.pem": [
      "-----BEGIN CERTIFICATE-----",
      "MIIFkzCCBHugAwIBAgISBI2xQ4r1kR8mZ0dYw9pQvX0aMA0GCSqGSIb3DQEBCwUA",
      "MDIxJjAkBgNVBAMMHXNsZWN0ZWQtc2VydmVyLXYwMi5sZS5wcm9k...",
      "-----END CERTIFICATE-----",
      "(notAfter: " + EXPIRED_AT + ")",
    ].join("\n"),

    "/etc/letsencrypt/live/checkout.shop.example/fullchain.pem": "-----BEGIN CERTIFICATE-----\n(certificate + intermediate, notAfter " + EXPIRED_AT + ")\n-----END CERTIFICATE-----",
    "/etc/letsencrypt/live/checkout.shop.example/privkey.pem": "-----BEGIN PRIVATE KEY-----\n(redacted)\n-----END PRIVATE KEY-----",

    "/etc/letsencrypt/renewal/checkout.shop.example.conf": [
      "# renew_before_expiry = 30 days",
      "version = 2.9.0",
      "archive_dir = /etc/letsencrypt/archive/checkout.shop.example",
      "cert = /etc/letsencrypt/live/checkout.shop.example/cert.pem",
      "privkey = /etc/letsencrypt/live/checkout.shop.example/privkey.pem",
      "chain = /etc/letsencrypt/live/checkout.shop.example/chain.pem",
      "fullchain = /etc/letsencrypt/live/checkout.shop.example/fullchain.pem",
      "",
      "[renewalparams]",
      "account = 8f2c1a9d4e6b7c0f",
      "authenticator = webroot",
      "webroot_path = /var/www/acme-challenge,",
      "server = https://acme-v02.api.letsencrypt.org/directory",
      "[[webroot_map]]",
      "checkout.shop.example = /var/www/acme-challenge",
    ].join("\n"),

    "/var/log/letsencrypt/letsencrypt.log": [
      "2026-10-07 03:11:02,114:ERROR:certbot._internal.renewal:Certificate not yet due for renewal",
      "2026-10-24 03:11:04,882:ERROR:certbot._internal.auth_handler:Challenge failed for domain checkout.shop.example",
      "2026-10-24 03:11:04,883:ERROR:certbot._internal.auth_handler:http-01 challenge for checkout.shop.example",
      "2026-10-24 03:11:04,884:ERROR:certbot._internal.auth_handler:Detail: Invalid response from http://checkout.shop.example/.well-known/acme-challenge/pM4x...: 404",
      "2026-10-31 03:11:05,102:ERROR:certbot._internal.renewal:Failed to renew certificate checkout.shop.example",
    ].join("\n"),

    "/etc/nginx/nginx.conf": "user www-data;\nworker_processes auto;\ninclude /etc/nginx/sites-enabled/*;\n",
  },

  seed: (world) => {
    world.diskTotalGb = 40;
    world.diskUsedGb = 18.4;
    world.memTotalMb = 4096;
    world.memUsedMb = 1480;

    world.services = {
      nginx: {
        name: "nginx",
        active: true,
        description: "A high performance web server and a reverse proxy server",
        log: "Started nginx - high performance web server.\nworker process 2210 started",
      },
      "certbot.timer": {
        name: "certbot",
        active: true,
        description: "Run certbot twice daily",
        log: [
          "Starting certbot.service - Certbot...",
          "Challenge failed for domain checkout.shop.example",
          "Detail: Invalid response from http://checkout.shop.example/.well-known/acme-challenge/pM4x...: 404",
          "certbot.service: Main process exited, code=exited, status=1/FAILURE",
        ].join("\n"),
      },
      sshd: { name: "sshd", active: true, description: "OpenBSD Secure Shell server", log: "Server listening on 0.0.0.0 port 22." },
      "checkout-api": {
        name: "checkout-api",
        active: true,
        description: "Checkout API behind the edge proxy",
        log: "listening on :8443",
      },
    };

    world.ports = [
      { proto: "tcp", local: "0.0.0.0:22", process: "sshd" },
      { proto: "tcp", local: "0.0.0.0:443", process: "nginx" },
      { proto: "tcp", local: "0.0.0.0:80", process: "nginx" },
      { proto: "tcp", local: "127.0.0.1:8443", process: "node" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 2210, user: "www-data", cpu: 0.2, mem: 0.4, command: "nginx: worker process" },
      { pid: 3411, user: "app", cpu: 1.1, mem: 3.4, command: "node /opt/checkout/server.js" },
    ];
  },

  rules: [
    {
      pattern: /^curl\s+.*https:\/\/checkout\.shop\.example/,
      output: (ctx) =>
        ctx.world.flags.certRenewed && ctx.world.flags.nginxReloaded
          ? ["HTTP/2 200", "server: nginx", "content-type: text/html", "", "<html>checkout ok</html>"].join("\n")
          : [
              "curl: (60) SSL certificate problem: certificate has expired",
              "More details here: https://curl.se/docs/sslcerts.html",
              "",
              "curl failed to verify the legitimacy of the server and therefore could not",
              "establish a secure connection to it.",
            ].join("\n"),
      asError: true,
    },

    {
      pattern: /^openssl\s+s_client/,
      output: (ctx) => {
        const renewed = Boolean(ctx.world.flags.certRenewed && ctx.world.flags.nginxReloaded);
        const notAfter = renewed ? RENEWED_AT : EXPIRED_AT;
        return [
          "CONNECTED(00000003)",
          "depth=1 C = US, O = Let's Encrypt, CN = R3",
          "depth=0 CN = checkout.shop.example",
          "---",
          "Certificate chain",
          " 0 s:CN = checkout.shop.example",
          "   i:C = US, O = Let's Encrypt, CN = R3",
          "   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256",
          "   v:NotBefore: Aug 1 03:11:00 2026 GMT; NotAfter: " + notAfter,
          "---",
          renewed
            ? "Verify return code: 0 (ok)"
            : [
                "verify error:num=10:certificate has expired",
                "notAfter=" + EXPIRED_AT,
                "Verify return code: 10 (certificate has expired)",
              ].join("\n"),
        ].join("\n");
      },
    },

    {
      pattern: /^openssl\s+x509/,
      output: (ctx) =>
        ctx.world.flags.certRenewed
          ? ["notBefore=Oct 31 03:11:00 2026 GMT", `notAfter=${RENEWED_AT}`].join("\n")
          : ["notBefore=Aug  1 03:11:00 2026 GMT", `notAfter=${EXPIRED_AT}`].join("\n"),
    },

    {
      pattern: /^certbot\s+certificates/,
      output: (ctx) =>
        [
          "Found the following certs:",
          "  Certificate Name: checkout.shop.example",
          "    Serial Number: 4b2f9d1e8a7c6b5d4e3f2a1b0c9d8e7f",
          "    Key Type: RSA",
          "    Domains: checkout.shop.example",
          "    Expiry Date: " + (ctx.world.flags.certRenewed ? RENEWED_AT : EXPIRED_AT + " (INVALID: EXPIRED)"),
          "    Certificate Path: /etc/letsencrypt/live/checkout.shop.example/fullchain.pem",
          "    Private Key Path: /etc/letsencrypt/live/checkout.shop.example/privkey.pem",
        ].join("\n"),
    },

    {
      pattern: /^ls\s+-l.*\/var\/www\/acme-challenge/,
      when: (world) => !world.flags.webrootRestored,
      output: "ls: cannot access '/var/www/acme-challenge': No such file or directory",
      asError: true,
    },
    {
      pattern: /^ls\s+-l.*\/var\/www\/acme-challenge/,
      when: (world) => Boolean(world.flags.webrootRestored),
      output: "total 0\ndrwxr-xr-x 3 root root 4096 Oct 31 03:22 .well-known",
    },

    {
      pattern: /^mkdir\s+-p\s+\/var\/www\/acme-challenge/,
      output: "",
      mutate: (world) => {
        world.flags.webrootRestored = true;
        world.flags.mkdirAcme = true;
        if (!world.dirs.includes("/var/www/acme-challenge")) world.dirs.push("/var/www/acme-challenge");
        if (!world.dirs.includes("/var/www/acme-challenge/.well-known/acme-challenge")) {
          world.dirs.push("/var/www/acme-challenge/.well-known/acme-challenge");
        }
      },
    },

    {
      pattern: /^certbot\s+renew/,
      when: (world) => !world.flags.webrootRestored,
      output: [
        "Saving debug log to /var/log/letsencrypt/letsencrypt.log",
        "Processing /etc/letsencrypt/renewal/checkout.shop.example.conf",
        "Cert is due for renewal, auto-renewing...",
        "Simulating renewal of an existing certificate for checkout.shop.example",
        "Challenge failed for domain checkout.shop.example",
        "Detail: Invalid response from http://checkout.shop.example/.well-known/acme-challenge/9tK...: 404",
        "Failed to renew certificate checkout.shop.example with error: Some challenges have failed.",
      ].join("\n"),
      asError: true,
    },
    {
      pattern: /^certbot\s+renew/,
      when: (world) => Boolean(world.flags.webrootRestored),
      output: [
        "Saving debug log to /var/log/letsencrypt/letsencrypt.log",
        "Processing /etc/letsencrypt/renewal/checkout.shop.example.conf",
        "Cert is due for renewal, auto-renewing...",
        "Successfully received certificate.",
        "Certificate is saved at: /etc/letsencrypt/live/checkout.shop.example/fullchain.pem",
        "Expires " + RENEWED_AT,
        "Congratulations, all renewals succeeded.",
      ].join("\n"),
      mutate: (world) => {
        world.flags.certRenewed = true;
        world.files["/etc/letsencrypt/live/checkout.shop.example/cert.pem"] =
          "-----BEGIN CERTIFICATE-----\n(new certificate issued Oct 31 03:24)\n(notAfter: " + RENEWED_AT + ")\n-----END CERTIFICATE-----";
      },
    },

    {
      pattern: /^systemctl\s+(reload|restart)\s+nginx$/,
      output: (ctx) =>
        ctx.world.flags.certRenewed
          ? "nginx: configuration file test is successful\nReloaded nginx."
          : "Reloaded nginx. Serving certificate expires " + EXPIRED_AT + ".",
      mutate: (world) => {
        if (world.flags.certRenewed) world.flags.nginxReloaded = true;
      },
    },

    {
      pattern: /^nginx\s+-t$/,
      output: [
        "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
        "nginx: configuration file /etc/nginx/nginx.conf test is successful",
      ].join("\n"),
    },

    /* 443 is open and the upstream is healthy — the two obvious decoys. */
    {
      pattern: /^ss\s+-tlnp$/,
      output: [
        "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
        "LISTEN 0      511          0.0.0.0:443       0.0.0.0:*     users:((\"nginx\",pid=2210,fd=8))",
        "LISTEN 0      511          0.0.0.0:80        0.0.0.0:*     users:((\"nginx\",pid=2210,fd=6))",
        "LISTEN 0      128        127.0.0.1:8443      0.0.0.0:*     users:((\"node\",pid=3411,fd=19))",
      ].join("\n"),
    },
    {
      pattern: /^curl\s+.*http:\/\/checkout\.shop\.example/,
      output: ["HTTP/1.1 301 Moved Permanently", "Location: https://checkout.shop.example/"].join("\n"),
    },
  ],

  isFixed: (world) => Boolean(world.flags.certRenewed && world.flags.nginxReloaded),

  seniorReplay: [
    "curl -I https://checkout.shop.example",
    "openssl s_client -connect checkout.shop.example:443 -servername checkout.shop.example",
    "openssl x509 -in /etc/letsencrypt/live/checkout.shop.example/cert.pem -noout -dates",
    "journalctl -u certbot -n 30",
    "cat /etc/letsencrypt/renewal/checkout.shop.example.conf",
    "mkdir -p /var/www/acme-challenge/.well-known/acme-challenge",
    "certbot renew --cert-name checkout.shop.example --force-renewal",
    "systemctl reload nginx",
    "curl -I https://checkout.shop.example",
  ],

  debrief: {
    whatHappened:
      "The certificate expired at 21:00 the previous evening. certbot tried to renew twice a day for the past week, but a deploy two weeks earlier had removed /var/www/acme-challenge. The HTTP-01 challenge wrote its token into a missing directory, nginx returned 404 for the challenge path, and certbot exited with an error that only went to the journal — no alert was wired to renewal failure. nginx itself was healthy the whole time: valid config, port 443 listening, upstream answering on 8443. It simply kept presenting a certificate that no longer existed in time.",
    howToFix:
      "Recreate the webroot, renew, then reload. `mkdir -p /var/www/acme-challenge/.well-known/acme-challenge`, `certbot renew --cert-name checkout.shop.example --force-renewal`, `systemctl reload nginx`. Verify with `curl -I` (no certificate warning) and `openssl s_client` (NotAfter is now in the future). Reload is enough because nginx re-reads certificate files on HUP; a hard restart just drops in-flight connections.",
    prevention:
      "Alert on certificate expiry at 21, 14, 7 and 2 days, and alert on `certbot renew` exiting non-zero — a silently failing renewal is the actual bug here. Exclude ACME paths from deploy cleanup. Add a synthetic check that validates the served chain daily.",
  },
};
