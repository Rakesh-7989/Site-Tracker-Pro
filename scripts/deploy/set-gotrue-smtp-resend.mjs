import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));

// Switch GoTrue custom SMTP from personal-Gmail app-password to Resend SMTP:
// verified-domain sender (hello@sitetrackpro.in), delivery visibility in the
// Resend dashboard, no dependency on the founder's Google account security.
const cfg = {
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_pass: env.RESEND_API_KEY,
  smtp_admin_email: "hello@sitetrackpro.in",
  smtp_sender_name: "SiteTrack Pro",
  smtp_max_frequency: 1,
  site_url: "https://sitetrackpro.in",
};

const r = await fetch("https://api.supabase.com/v1/projects/nntkxojdeyziemdhyjvg/config/auth", {
  method: "PATCH",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(cfg),
});
console.log("PATCH HTTP", r.status);
if (!r.ok) console.log(await r.text());
else {
  const v = await fetch("https://api.supabase.com/v1/projects/nntkxojdeyziemdhyjvg/config/auth", {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  }).then(x => x.json());
  console.log("smtp_host :", v.smtp_host);
  console.log("smtp_port :", v.smtp_port);
  console.log("smtp_user :", v.smtp_user);
  console.log("admin_mail:", v.smtp_admin_email);
}
