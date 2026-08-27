# SiteTrack Pro — Google Play Store Submission Runbook

Capacitor scaffold already exists (`capacitor.config.json`, appId
`in.buildco.sitetrack`). This is the 8-step path to a live Play Store
listing. Estimated time: 5-7 working days end-to-end (most of it Google's
review + Play Console verification waits).

---

## Step 0 — Prerequisites (one-time)

- **Google Play Console account** — $25 one-time fee, takes 24h to verify
- **Android Studio installed** locally — needed for signed bundle build
- **A keystore** — generated once, then guarded like a database password
  (lose it = can never update the app under the same package name)
- **App icon** — 512×512 PNG, no transparency, on cream `#fffaf0` bg
- **Feature graphic** — 1024×500 PNG (Play listing hero)
- **At least 2 phone screenshots** + **1 tablet screenshot**

---

## Step 1 — Install Capacitor + Android platform (one-time)

```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/android
npm i @capacitor/splash-screen @capacitor/camera @capacitor/geolocation

npx cap init --skip-appid    # config already exists
npx cap add android          # creates /android subfolder
```

This generates the Android Studio project under `android/`. Commit the
`android/` folder so the Play Store build is reproducible.

---

## Step 2 — Build the web bundle + sync into Android

```bash
npm run build                 # outputs to dist/
npx cap sync android          # copies dist/ → android/app/src/main/assets/public/
                              # AND injects plugin native code
```

Re-run `cap sync` every time `dist/` changes (e.g. after `npm run build`).

---

## Step 3 — Generate a release keystore (one-time, IRREPLACEABLE)

```bash
keytool -genkey -v -keystore sitetrack-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias sitetrack-key
```

It prompts for:
- A keystore password — **save in 1Password / Bitwarden, never lose this**
- A key alias password — same
- Org details (Common Name, Organisation, City, State, Country = IN)

**Back up `sitetrack-release.jks` to two physical drives + cloud storage
encrypted.** If you lose this file, you can never publish updates to the
same Play Store listing — Google's signature mismatch protection will
reject every new build. New keystore = new app, new package name, new
listing, zero install carry-over.

---

## Step 4 — Wire the keystore into Android build (one-time)

Edit `android/app/build.gradle`:

```gradle
android {
  signingConfigs {
    release {
      storeFile file(System.getenv("SITETRACK_KEYSTORE_PATH") ?: "../sitetrack-release.jks")
      storePassword System.getenv("SITETRACK_KEYSTORE_PASSWORD")
      keyAlias "sitetrack-key"
      keyPassword System.getenv("SITETRACK_KEY_PASSWORD")
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled true
      shrinkResources true
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
  }
}
```

Then before any release build:
```bash
export SITETRACK_KEYSTORE_PASSWORD="<your keystore pw>"
export SITETRACK_KEY_PASSWORD="<your key pw>"
export SITETRACK_KEYSTORE_PATH="/secure/path/sitetrack-release.jks"
```

Never commit the keystore or the passwords. `.gitignore` already excludes
`*.jks`; verify with `git check-ignore -v android/sitetrack-release.jks`.

---

## Step 5 — Build the signed App Bundle (.aab)

```bash
cd android
./gradlew bundleRelease       # outputs app/build/outputs/bundle/release/app-release.aab
```

The `.aab` is what Play Store ingests. Verify locally:
```bash
bundletool build-apks --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=/tmp/sitetrack.apks --mode=universal
unzip -p /tmp/sitetrack.apks universal.apk > /tmp/sitetrack.apk
adb install -r /tmp/sitetrack.apk   # sideload to a phone, smoke test
```

---

## Step 6 — Create the Play Store listing

Play Console → Create app:

| Field | Value |
| ----- | ----- |
| App name | **SiteTrack Pro** |
| Default language | English (India) |
| App or game | App |
| Free or paid | Free (SaaS billing is in-app via Cashfree, not Play Billing) |
| Declarations | Accept Play Policies, Export laws |

### Store listing content

- **Short description** (80 chars max):
  > The editorial-grade construction record for Indian builders.
- **Full description** (4000 chars): copy from `archive/marketing/index.html` hero +
  diff cards.
- **App icon**: 512×512 PNG, cream bg, amber S mark (`archive/marketing/index.html`
  has the design pattern — re-export at 512).
- **Feature graphic**: 1024×500. Suggested: dashboard mock from landing page.
- **Phone screenshots** (min 2, recommended 4): login screen, Org Admin
  dashboard, project detail with BOQ tab, Drawing release.
- **Tablet screenshot** (10-inch): project detail wide layout.

### Content rating questionnaire

- No violence, no sexual content, no profanity, no controlled substances.
- Users can interact with each other (in-app messages) → YES.
- Personal info collected: name, email, project data → YES.
  Expected rating: **Everyone** (3+).

### Data safety form

- **Personal info**: name, email, phone — collected, shared with no third
  parties, encrypted in transit (HTTPS), encrypted at rest (Supabase).
- **Financial info**: builder firm transaction data — collected, NOT shared,
  encrypted, deletion on request.
- **Location**: optional (photo geolocation opt-in) — collected only when
  user explicitly enables `photoGeo` in Feature Toggles.
- **Photos & files**: collected via Camera API for site updates and
  drawings, stored in user's Supabase project.

### Target audience + content

- Target age group: 18+ (B2B software)
- Appeals to children: No

---

## Step 7 — Upload + submit to internal track first

1. Play Console → Internal testing → Create new release
2. Upload `app-release.aab` (signed)
3. Add 5-10 internal testers by email (your team)
4. Submit for review → usually approved in 4-8 hours for internal track
5. Each tester opens the opt-in URL, installs from Play Store, tests

After internal testing passes (2-3 days of real use):

1. Promote to **Closed testing** (50-100 testers — design partners)
2. Then **Open testing** (public beta — no review delay after first approval)
3. Finally **Production** (full Play Store listing)

---

## Step 8 — App auto-update wiring

In `src/App.jsx` add an in-app update banner that checks if a newer version
is available via Play Core In-App Updates (Capacitor plugin
`@capacitor-community/in-app-update`). This is critical: when you ship a
production fix, users don't have to manually find the update.

```bash
npm i @capacitor-community/in-app-update
npx cap sync android
```

Then in App.jsx mount effect:
```js
import { AppUpdate } from "@capacitor-community/in-app-update";
useEffect(() => {
  if (window.Capacitor) {
    AppUpdate.getAppUpdateInfo().then(info => {
      if (info.updateAvailability === 2) AppUpdate.startFlexibleUpdate();
    });
  }
}, []);
```

---

## Day-of-launch checklist

- [ ] Keystore backed up in 3 places (1Password + 2 physical drives)
- [ ] `npm test` all green (272 + new tests)
- [ ] `docs/CONNECT_SUPABASE.md` checklist passed (production DB live)
- [ ] `docs/CASHFREE_ONBOARDING.md` Edge Functions deployed
- [ ] Privacy policy URL live (`sitetrackpro.in/privacy`)
- [ ] Terms of service URL live (`sitetrackpro.in/terms`)
- [ ] Support email monitored (`hello@sitetrackpro.in`)
- [ ] Sentry MCP connected for crash monitoring (see `docs/MCP_TOOLKIT.md`
      Part C)
- [ ] First internal tester installed from Play Store and signed in
      successfully via magic link
- [ ] App icon + screenshots match brand (cream + amber + Fraunces)

---

## App Store (iOS) — same flow, different steps

iOS submission is broadly similar but more painful:
- Requires a **paid Apple Developer account** ($99/year, not one-time)
- Requires a Mac for the build (Xcode-only)
- Review is stricter — expect 1-2 weeks first time
- Cannot do internal testing without TestFlight (free but separate UI)

Recommendation: ship Android first (Indian builders use Android 90%+),
add iOS in month 6 after the first ₹5L MRR validates the model.

---

## Related runbooks

- `docs/CONNECT_SUPABASE.md` — database must be live first
- `docs/CASHFREE_ONBOARDING.md` — subscription billing
- `docs/DEPLOY_NOW.md` — web deployment
- `docs/MCP_TOOLKIT.md` — Sentry MCP for post-launch monitoring
- `capacitor.config.json` — the source of truth for appId + bundle settings
