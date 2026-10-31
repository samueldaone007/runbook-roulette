/**
 * Scenario 7 — Locked out by an sshd policy change.
 *
 * Teaching goal: syntax validation is not authorization validation. The new
 * hardening file parses perfectly and `sshd -t` is happy; it simply does not
 * list the account you are logged in as. You are still inside because this
 * session predates the change — close it and the door is locked.
 *
 * State is real: `sshd -T` renders the effective policy, the reload flag gates
 * the fix, and a fresh `ssh` attempt succeeds only when both are correct.
 */

import type { Scenario, World } from "../engine/types";

const DROP_IN = "/etc/ssh/sshd_config.d/50-hardening.conf";

const allowUsersLine = (world: World) => {
  const line = (world.files[DROP_IN] ?? "")
    .split("\n")
    .find((entry) => /^\s*AllowUsers\s+/.test(entry));
  if (!line) return null;
  return line.replace(/^\s*AllowUsers\s+/, "").trim().split(/\s+/);
};

const opsAllowed = (world: World) => {
  const users = allowUsersLine(world);
  // No AllowUsers directive means sshd permits every valid account. That also
  // reopens the lockout, though it weakens the hardening baseline.
  return users === null || users.some((user) => user.split("@")[0] === "ops");
};

const live = (world: World) =>
  opsAllowed(world) && Boolean(world.flags.sshdReloaded) && Boolean(world.services.sshd?.active);

const effectiveAllowUsers = (world: World) =>
  opsAllowed(world) ? "deploy ops" : "deploy";

export const sshLockout: Scenario = {
  id: "ssh-lockout",
  title: "The door closed behind you",
  category: "access",
  difficulty: "mid",
  parSeconds: 420,

  alert: {
    service: "bastion-01",
    severity: "P1",
    symptom: "on-call cannot open a new SSH session to the bastion; existing sessions still work",
    at: "03:12",
  },

  hostname: "bastion-01",
  user: "ops",
  banner: [
    "Ubuntu 24.04.1 LTS (GNU/Linux 6.5.0-27-generic x86_64)",
    "",
    "Last login: Sat Oct 31 02:44:09 2026 from 10.20.4.11",
    "This session was opened before the 03:02 hardening change. Do not close it until you are sure.",
  ],

  rootCauseId: "allowusers-excludes-ops",
  rootCauseSummary:
    "The ssh-hardening role replaced AllowUsers with a single deploy account at 03:02. The ops break-glass account is no longer listed, so sshd rejects new sessions for ops even though the key is valid. sshd is running, port 22 is open, and the config parses cleanly. This session survived because it was authenticated before the reload.",
  options: [
    {
      id: "allowusers-excludes-ops",
      label: "The hardening drop-in sets AllowUsers to deploy, which excludes the ops account",
      detail: "auth.log says 'not listed in AllowUsers' and sshd -T shows allowusers deploy.",
    },
    {
      id: "bad-key-permissions",
      label: "The ops authorized_keys file has the wrong permissions and sshd ignores it",
      detail: "Would show 'Authentication refused: bad ownership or modes' and still permit other accounts.",
    },
    {
      id: "firewall-22",
      label: "A security-group change is dropping port 22 from the office range",
      detail: "Would time out before authentication and leave no sshd auth.log entries.",
    },
    {
      id: "sshd-down",
      label: "sshd crashed, so nothing is listening on port 22",
      detail: "Would show 'Connection refused' and an inactive service; sshd is active here.",
    },
  ],

  goodSteps: [
    {
      id: "auth-log",
      label: "Read why the login was rejected",
      command: "tail -n 50 /var/log/auth.log",
      match: /^(tail|cat|less|grep)\b.*\/var\/log\/auth\.log/,
      weight: 2,
    },
    {
      id: "change-log",
      label: "Find the change that landed just before the lockout",
      command: "cat /var/log/change.log",
      match: /^(cat|less|tail)\b.*\/var\/log\/change\.log/,
      weight: 1,
    },
    {
      id: "read-drop-in",
      label: "Read the hardening drop-in",
      command: "cat /etc/ssh/sshd_config.d/50-hardening.conf",
      match: /^(cat|less)\b.*50-hardening\.conf/,
      weight: 2,
    },
    {
      id: "effective-policy",
      label: "Inspect the effective policy, not just the file",
      command: "sshd -T | grep -i allowusers",
      match: /^sshd\s+-T\b.*allowusers/i,
      weight: 2,
    },
    {
      id: "syntax-check",
      label: "Confirm the configuration at least parses",
      command: "sshd -t",
      match: /^sshd\s+-t\b/,
      weight: 1,
    },
    {
      id: "listen-check",
      label: "Confirm sshd is listening, so this is not a network problem",
      command: "ss -tlnp | grep :22",
      match: /^ss\b.*:22/,
      weight: 1,
    },
    {
      id: "fix-allowusers",
      label: "Add the ops account back to AllowUsers",
      command: "sed -i 's/^AllowUsers deploy$/AllowUsers deploy ops/' /etc/ssh/sshd_config.d/50-hardening.conf",
      match: /^sed\s+-i\b.*50-hardening\.conf/,
      weight: 3,
    },
    {
      id: "reload",
      label: "Apply the policy with a reload, not a restart",
      command: "systemctl reload sshd",
      match: /^systemctl\s+reload\s+sshd/,
      weight: 2,
    },
    {
      id: "verify-login",
      label: "Prove a new session is possible before closing this one",
      command: "ssh -o BatchMode=yes ops@127.0.0.1 true",
      match: /^ssh\b.*ops@127\.0\.0\.1/,
      weight: 2,
    },
  ],

  badActions: [
    {
      id: "restart-sshd",
      label: "Restarted sshd instead of reloading it",
      pattern: /^systemctl\s+restart\s+sshd/,
      penalty: 4,
      why: "A restart briefly removes the listener. If your new policy is wrong, you have no way back in — and you did not need to drop it.",
    },
    {
      id: "stop-sshd",
      label: "Stopped sshd",
      pattern: /^systemctl\s+stop\s+sshd/,
      penalty: 15,
      why: "You have locked every administrator out of the bastion, including the deploy account that was still working.",
    },
    {
      id: "mask-sshd",
      label: "Masked sshd so it cannot start again",
      pattern: /^systemctl\s+mask\s+sshd/,
      penalty: 15,
      why: "Masking survives reboots and requires console access to undo. This is how a bad night becomes a data-centre visit.",
    },
    {
      id: "delete-ssh-config",
      label: "Deleted the SSH configuration",
      pattern: /^rm\s+-[rf]*\s+\/etc\/ssh/,
      penalty: 15,
      why: "You removed the hardening baseline and the evidence. Restoring a known-good sshd config now depends on backups.",
    },
    {
      id: "reboot",
      label: "Rebooted the bastion",
      pattern: /^(reboot|shutdown|init\s+6)/,
      penalty: 15,
      why: "The bad policy is on disk, and the reboot kills the one session that could still fix it.",
    },
  ],

  hint: "Read `/var/log/auth.log`, then compare the file with the effective policy: `cat /etc/ssh/sshd_config.d/50-hardening.conf` and `sshd -T | grep -i allowusers`. Add ops to AllowUsers, run `sshd -t`, then reload — a restart is the risky move.",

  files: {
    "/etc/ssh/sshd_config": [
      "# This is the main sshd server system-wide configuration file.",
      "Include /etc/ssh/sshd_config.d/*.conf",
      "",
      "Port 22",
      "AddressFamily any",
      "PubkeyAuthentication yes",
      "AuthorizedKeysFile .ssh/authorized_keys",
      "Subsystem sftp /usr/lib/openssh/sftp-server",
    ].join("\n"),

    [DROP_IN]: [
      "# applied by ansible role ssh-hardening v4 on 2026-10-31 03:02",
      "# CHG-4431: bastion access baseline",
      "PermitRootLogin no",
      "PasswordAuthentication no",
      "AllowUsers deploy",
      "MaxAuthTries 3",
      "ClientAliveInterval 300",
    ].join("\n"),

    "/home/ops/break-glass.txt": [
      "Break-glass account: ops",
      "The ops account must remain in AllowUsers on every bastion.",
      "It is the account used when the deploy role or SSO is broken.",
      "",
      "Reviewed 2026-08-12 during the access review.",
    ].join("\n"),

    "/var/log/auth.log": [
      "Oct 31 03:02:04 bastion-01 sshd[2188]: Received signal 15; terminating.",
      "Oct 31 03:02:04 bastion-01 systemd[1]: Reloading OpenBSD Secure Shell server...",
      "Oct 31 03:02:04 bastion-01 sshd[2204]: Server listening on 0.0.0.0 port 22.",
      "Oct 31 03:08:41 bastion-01 sshd[2211]: User ops from 10.20.4.11 not allowed because not listed in AllowUsers",
      "Oct 31 03:08:41 bastion-01 sshd[2211]: Connection closed by authenticating user ops 10.20.4.11 port 51222 [preauth]",
      "Oct 31 03:09:02 bastion-01 sshd[2219]: User ops from 10.20.4.11 not allowed because not listed in AllowUsers",
      "Oct 31 03:09:02 bastion-01 sshd[2219]: Connection closed by authenticating user ops 10.20.4.11 port 51236 [preauth]",
      "Oct 31 03:10:19 bastion-01 sshd[2233]: Accepted publickey for deploy from 10.20.7.44 port 43110 ssh2",
      "Oct 31 03:10:19 bastion-01 sshd[2233]: pam_unix(sshd:session): session opened for user deploy",
    ].join("\n"),

    "/var/log/change.log": [
      "2026-10-30 21:44:02 change: CHG-4431 approved - apply ssh-hardening v4 to all bastions",
      "2026-10-31 03:01:51 change: ansible role ssh-hardening v4 started on bastion-01",
      "2026-10-31 03:02:04 change: AllowUsers replaced with 'deploy' (previous value: 'deploy ops')",
      "2026-10-31 03:02:04 change: sshd reloaded successfully",
      "2026-10-31 03:02:05 change: role reported ok=14 changed=2 failed=0",
      "2026-10-31 03:08:41 change: alert - ops login rejected (not listed in AllowUsers)",
    ].join("\n"),

    "/var/log/syslog": [
      "Oct 31 03:02:04 bastion-01 systemd[1]: Reloaded OpenBSD Secure Shell server.",
      "Oct 31 03:02:05 bastion-01 ansible-role[2177]: ssh-hardening v4 completed on bastion-01",
      "Oct 31 03:08:41 bastion-01 sshd[2211]: Connection closed by authenticating user ops 10.20.4.11 port 51222 [preauth]",
    ].join("\n"),
  },

  seed: (world) => {
    world.diskTotalGb = 40;
    world.diskUsedGb = 11.3;
    world.memTotalMb = 4096;
    world.memUsedMb = 1480;

    world.services = {
      sshd: {
        name: "sshd",
        active: true,
        description: "OpenBSD Secure Shell server",
        log: [
          "Server listening on 0.0.0.0 port 22.",
          "User ops from 10.20.4.11 not allowed because not listed in AllowUsers",
          "Connection closed by authenticating user ops 10.20.4.11 port 51222 [preauth]",
          "Accepted publickey for deploy from 10.20.7.44 port 43110 ssh2",
        ].join("\n"),
      },
      cron: {
        name: "cron",
        active: true,
        description: "Regular background program processing daemon",
        log: "session opened for user root",
      },
      ufw: {
        name: "ufw",
        active: true,
        description: "Uncomplicated firewall",
        log: "Default incoming policy is deny.",
      },
    };

    world.ports = [
      { proto: "tcp", local: "0.0.0.0:22", process: "sshd" },
      { proto: "tcp", local: "0.0.0.0:9100", process: "node_exporter" },
    ];

    world.processes = [
      { pid: 1, user: "root", cpu: 0.1, mem: 0.2, command: "/sbin/init" },
      { pid: 2204, user: "root", cpu: 0.2, mem: 0.4, command: "sshd: /usr/sbin/sshd -D" },
      { pid: 2240, user: "ops", cpu: 0.1, mem: 0.3, command: "-bash" },
      { pid: 700, user: "root", cpu: 0.1, mem: 0.2, command: "/usr/sbin/cron -f" },
    ];
  },

  rules: [
    {
      pattern: /^sshd\s+-T\b.*allowusers/i,
      output: (ctx) => `allowusers ${effectiveAllowUsers(ctx.world)}`,
    },

    {
      pattern: /^sshd\s+-T\b/,
      output: (ctx) =>
        [
          "port 22",
          "addressfamily any",
          "listenaddress 0.0.0.0:22",
          "permitrootlogin no",
          "passwordauthentication no",
          "pubkeyauthentication yes",
          `allowusers ${effectiveAllowUsers(ctx.world)}`,
          "maxauthtries 3",
          "clientaliveinterval 300",
          "subsystem sftp /usr/lib/openssh/sftp-server",
        ].join("\n"),
    },

    {
      pattern: /^sshd\s+-t\b/,
      output: "sshd: syntax OK (this checks the file parses, not whether your account is allowed)",
    },

    {
      pattern: /^systemctl\s+reload\s+sshd$/,
      when: (world) => Boolean(world.services.sshd?.active),
      output: (ctx) => {
        if (!opsAllowed(ctx.world)) {
          return [
            "Reloaded OpenBSD Secure Shell server.",
            "Warning: AllowUsers still does not include ops. New sessions will be rejected.",
          ].join("\n");
        }
        return [
          "Reloaded OpenBSD Secure Shell server.",
          "Policy now permits: deploy ops.",
        ].join("\n");
      },
      mutate: (world) => {
        world.flags.sshdReloaded = opsAllowed(world);
      },
    },

    {
      pattern: /^systemctl\s+reload\s+sshd$/,
      output: "Failed to reload sshd.service: Unit sshd.service is not active.",
      asError: true,
    },

    {
      pattern: /^systemctl\s+restart\s+sshd$/,
      output: (ctx) => {
        const policy = opsAllowed(ctx.world) ? "deploy ops" : "deploy";
        return [
          "Job for sshd.service completed successfully.",
          "Warning: the listener was torn down and restarted. Existing sessions survived, but a bad policy here locks you out.",
          `Effective AllowUsers: ${policy}`,
        ].join("\n");
      },
      mutate: (world) => {
        world.flags.sshdReloaded = opsAllowed(world);
        const service = world.services.sshd;
        if (service) service.active = true;
      },
      asError: true,
    },

    {
      pattern: /^systemctl\s+start\s+sshd$/,
      output: "Job for sshd.service completed successfully.",
      mutate: (world) => {
        const service = world.services.sshd;
        if (service) service.active = true;
      },
    },

    {
      pattern: /^ssh\b.*ops@127\.0\.0\.1/,
      when: (world) => live(world),
      output: "ops@127.0.0.1: login accepted (publickey). You can safely open a new session.",
    },
    {
      pattern: /^ssh\b.*ops@127\.0\.0\.1/,
      output: "ops@127.0.0.1: Permission denied (publickey).",
      asError: true,
    },

    {
      pattern: /^ss\b.*:22/,
      output: [
        "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
        "LISTEN 0      128      0.0.0.0:22         0.0.0.0:*     users:((\"sshd\",pid=2204,fd=3))",
      ].join("\n"),
    },
  ],

  isFixed: live,

  seniorReplay: [
    "tail -n 50 /var/log/auth.log",
    "cat /var/log/change.log",
    "cat /etc/ssh/sshd_config.d/50-hardening.conf",
    "sshd -T | grep -i allowusers",
    "sshd -t",
    "ss -tlnp | grep :22",
    "sed -i 's/^AllowUsers deploy$/AllowUsers deploy ops/' /etc/ssh/sshd_config.d/50-hardening.conf",
    "sshd -t",
    "systemctl reload sshd",
    "ssh -o BatchMode=yes ops@127.0.0.1 true",
  ],

  debrief: {
    whatHappened:
      "The ssh-hardening role was approved to tighten bastion access. Its v4 template sets AllowUsers to a single value and replaces the file wholesale; the previous value was 'deploy ops'. The role ran at 03:01, wrote AllowUsers deploy, and reloaded sshd. Nothing failed: the file parsed, the service reloaded, and the deploy account kept working. The ops break-glass account simply stopped being allowed. Existing sessions were authenticated before the reload, so yours kept running, which is why the incident felt like 'SSH is broken for everyone else'. The auth log is explicit: 'not listed in AllowUsers'.",
    howToFix:
      "Add ops back to the allow list and reload the policy. `sed -i 's/^AllowUsers deploy$/AllowUsers deploy ops/' /etc/ssh/sshd_config.d/50-hardening.conf`, validate with `sshd -t`, then `systemctl reload sshd`. Reload applies the new policy without dropping the listener; restart also works, but it is the riskier move when you are one bad file away from having no remote access. Prove a new session works with a second connection before you close the one you have. `sshd -t` only checks syntax — it cannot tell you that you have excluded your own account.",
    prevention:
      "Do not replace allow lists from a template without merging the break-glass accounts. Add `ops` to the role's mandatory-users variable and a test that asserts it survives every hardening run. Run `sshd -T` in the change pipeline and diff the effective policy against the previous one, alerting on removed users or groups. Keep an out-of-band console path (cloud serial console, IPMI, a second bastion) and test it quarterly, because a reload is exactly when you find out it does not work.",
  },
};
