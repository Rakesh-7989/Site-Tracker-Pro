# Native Mobile Build (Capacitor)

SiteTrack ships as a PWA out of the box. To distribute on the iOS App Store and Google Play, wrap the production build with Capacitor — no code rewrite required.

## One-time setup

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
