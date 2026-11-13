#!/usr/bin/env node
/**
 * SiteTrack Pro — Cloudflare Workers Auth Service Unit Test
 */

import { hashPassword, verifyPassword, signJwt, verifyJwt } from "../../workers/api/src/services/authService.ts";

console.log("\n── Testing Cloudflare Workers Auth Service ──\n");

let pass = 0;
let fail = 0;

const ok = (cond, label) => {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
};

async function run() {
  const password = "SiteTrackSecure2026!";
  const hash = await hashPassword(password);

  ok(typeof hash === "string" && hash.includes(":"), "hashPassword generates salt:hash hex string");
  
  const isValid = await verifyPassword(password, hash);
  ok(isValid === true, "verifyPassword accepts correct password");

  const isInvalid = await verifyPassword("WrongPassword!", hash);
  ok(isInvalid === false, "verifyPassword rejects incorrect password");

  const secret = "super-secret-cloudflare-jwt-signing-key-2026";
  const payload = { sub: "usr_123", email: "builder@sitetrackpro.in", role: "admin" };
  const token = await signJwt(payload, secret, 3600);

  ok(typeof token === "string" && token.split(".").length === 3, "signJwt creates valid 3-part JWT");

  const decoded = await verifyJwt(token, secret);
  ok(decoded && decoded.sub === "usr_123" && decoded.email === "builder@sitetrackpro.in", "verifyJwt extracts correct payload");

  const tamperedToken = token.slice(0, -5) + "abcde";
  const tamperedResult = await verifyJwt(tamperedToken, secret);
  ok(tamperedResult === null, "verifyJwt rejects tampered signature");

  const wrongSecretResult = await verifyJwt(token, "wrong-secret-key");
  ok(wrongSecretResult === null, "verifyJwt rejects signature with wrong key");

  console.log(`\nAuth Service Test Summary: ${pass} passed, ${fail} failed.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(1);
});

