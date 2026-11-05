import assert from "node:assert/strict";
import test from "node:test";
import { sshTarget } from "../src/ssh.ts";
test("SSH host rejects options, shell syntax, and control characters", () => {
  assert.equal(sshTarget("rn"), "rn");
  assert.equal(sshTarget("root@server.example"), "root@server.example");
  for (const value of [
    "-oProxyCommand=bad",
    "rn;touch /tmp/x",
    "rn\nwhoami",
    "$(whoami)",
    "rn -p 22",
    "",
  ])
    assert.throws(() => sshTarget(value));
});
