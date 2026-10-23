# BTX Ops Hub iPhone app

The live Ops Hub (https://ops.thebtxfoundation.org) inside a native iPhone shell, for the eight board members. It adds a
Face ID lock, an offline page and push notifications. Because the app loads the live site, an Ops Hub change reaches the
phones with no new App Store review. Only a change in this folder needs a new build.

- **Plan and build spec:** `docs/ops-iphone-app/BUILD.md`. The screens come from the Figma file "BTX Apps", section "iPhone app".
- **Not part of the web build.** This folder is outside the npm workspaces, so Vercel and `npm ci` at the repo root ignore it.
- **iPhone only.** Bundle id `org.thebtxfoundation.opshub`, team Yachtsy, LLC (`6H2R38WKP3`), display name "BTX Ops Hub".

## What is here

| Path | What it does |
| --- | --- |
| `capacitor.config.ts` | Points the shell at the live site; the offline page; push options |
| `native-shell/offline.html` | Shown when the site can't be reached (works with no network) |
| `ios/App/App/PrivacyLock.swift` | The Face ID lock: covers the app when it isn't active, asks after 60 seconds or more away |
| `ios/App/App/AppDelegate.swift` | Starts the lock and forwards push registration to Capacitor |
| `ios/App/App/AppDebug.entitlements`, `AppRelease.entitlements` | Push environment: `development` for Debug, `production` for Release (Xcode does not swap it at archive time) |

## Set up and run in the simulator

```bash
cd apps/ops/mobile
npm install --ignore-workspace
npx cap sync ios            # a fresh checkout needs this: public/ and config files are generated, not committed
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted org.thebtxfoundation.opshub
```

Capacitor 8 uses Swift Package Manager, so there is no `.xcworkspace`: always pass `-project`.

## Checking the lock

- The cold launch shows the lock cover. Background the app for 60 seconds or more and come back: it shows again.
- Simulated Face ID is unreliable on recent iOS versions (the simulator also ships with a passcode). Verify the unlock on a real phone.
- To see the page behind the lock in the simulator, build a scratch copy outside the repo with `PrivacyLock.shared.start()` commented out.
  Never commit that.

## Archiving for TestFlight

1. Bump `CURRENT_PROJECT_VERSION` in the Xcode project (a build number Apple has not seen).
2. In Xcode: open `ios/App/App.xcodeproj`, choose "Any iOS Device (arm64)", Product → Archive, then Distribute App → TestFlight Internal Only.
3. TestFlight builds expire after 90 days; the App Store build does not.

The safety check in Claude Code blocks `xcodebuild archive` and uploads, so Dominick runs these steps (or uses the App Store Connect key once it exists).
