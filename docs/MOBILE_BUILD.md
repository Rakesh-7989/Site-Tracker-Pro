# Native Mobile Build (Capacitor)

SiteTrack ships as a PWA out of the box. To distribute on the iOS App Store and Google Play, wrap the production build with Capacitor — no code rewrite required.

## Current status (2026-08-25): FOUNDATION DONE ✅

- **Capacitor 8.5.0** installed (`@capacitor/core` + `@capacitor/cli` devDep + `@capacitor/android`).
- `capacitor.config.ts` committed — appId **`in.sitetrackpro.app`**, webDir `dist`, `androidScheme: https`.
- **`android/` project generated and committed** — `compileSdk 36 / targetSdk 36` (meets the Aug-31-2026 Play target-API requirement from day one), minSdk 24.
- Runtime detector: `src/lib/platform.ts` (`isNativeMobile()` / `getPlatform()`) — service worker already skipped inside the shell via this gate.
- Scripts: `npm run mobile:build` = production web build + `cap sync android`.

### Local commands (Node >=22 required by the Capacitor CLI)

```sh
nvm use 24.11.0        # CLI needs Node >=22 (project CI stays on Node 20)
npm run mobile:build   # build dist/ + copy into android/
npx cap open android   # Android Studio → Build > Generate Signed Bundle
nvm use 20.19.5        # back to the project default
```

Building the AAB additionally requires Android Studio + SDK (founder machine); scaffolding/sync works without it.

### Next phases
1. Mobile shell polish (bottom nav, safe-area insets, native splash/icons via `@capacitor/assets`).
2. Phase-5 plugins per the table below (`camera`, `geolocation`, `push`, `share`, `network`).
3. Play Console: internal testing track with a signed AAB.

---

## One-time setup (historical reference — ALREADY DONE above)

```sh
npm install --save-dev @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios @capacitor/camera @capacitor/geolocation @capacitor/splash-screen
npx cap init    # answers from capacitor.config.json
npx cap add android
npx cap add ios
```

This creates `android/` and `ios/` folders alongside the React app. Commit them to git.

## Per-release flow

```sh
npm run build         # Vite produces dist/
npx cap sync          # copies dist/ + plugins into native projects
npx cap open android  # opens Android Studio
npx cap open ios      # opens Xcode (macOS only)
```

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle → upload to Play Console.**

In Xcode: **Product → Archive → Distribute App → App Store Connect.**

## Plugins to enable

| Plugin | Why |
| --- | --- |
| `@capacitor/camera` | Replace HTML `<input capture="environment">` with the native camera API for better photo quality + cropping. |
| `@capacitor/geolocation` | Higher-accuracy GPS than `navigator.geolocation` + background location for site geofencing later. |
| `@capacitor/push-notifications` | DPR generated → push to architect's phone "Today's report ready". |
| `@capacitor/share` | Native share sheet (WhatsApp, Drive, email) instead of `wa.me` URL. |
| `@capacitor/filesystem` | Save attachments to device for true offline viewing. |
| `@capacitor/network` | Replaces `navigator.onLine` with reliable platform-native online detection. |

## App store assets

- **Icon**: use `public/icon-512.svg` as the source. Tools: [Capacitor Assets](https://github.com/ionic-team/capacitor-assets) generates all sizes.
- **Splash screen**: cream background `#fdfbf6` with the SiteTrack gold logo centered.
- **Screenshots**: dashboard, project detail hero, DPR PDF, BOQ — captured at iPhone 15 Pro Max and Pixel 8 Pro sizes.
- **Listing**: lead with "Editorial premium construction tracker — India-ready, ₹999/mo".

## Bundle ID

- Android: `in.buildco.sitetrack`
- iOS: `in.buildco.sitetrack`

Change in `capacitor.config.json` if you'd rather use your own domain.

## Known gotchas

- Service worker (`public/sw.js`) is **disabled inside Capacitor** because the native shell loads assets via `file://` or `capacitor://`. SW caching only runs on the web PWA build.
- localStorage works inside Capacitor but IndexedDB (`src/lib/offline.js`) is the durable option for binary attachments.
- Push notifications require Firebase Cloud Messaging (Android) and APNs (iOS) setup — separate config files needed.

## Roadmap after first native release

1. Replace `<input capture="environment">` with `@capacitor/camera` for better UX.
2. Native share sheet via `@capacitor/share` for DPR delivery.
3. Push notifications via FCM/APNs once Supabase backend lands.
4. Biometric login (`@capacitor/biometric-auth`) for site-engineer phones.
5. App Store / Play Store submission with screenshots from `artifacts/`.
