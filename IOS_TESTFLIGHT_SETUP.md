# iOS TestFlight Automation Setup

This project now includes Fastlane automation for TestFlight uploads.

## What was added

- Fastlane gem: `ios/App/Gemfile`
- Fastlane config: `ios/App/fastlane/Fastfile`
- App metadata config: `ios/App/fastlane/Appfile`
- Environment template: `ios/App/fastlane/.env.testflight.example`
- NPM scripts in `package.json`

## Important

`cap sync ios` does not upload to TestFlight.
Use `npm run ios:testflight` for sync + build + upload.

## App Icon and Splash Asset Pipeline

Mobile icons and splash screens are generated from git-tracked source files before sync:

- `assets/icon-only.png`
- `assets/splash.png`

Use these commands after pulling from git:

```bash
npm install
npm run ios:sync
```

`npm run ios:sync` now runs asset generation first, then `cap sync ios`, so the current app logo and splash are always pushed into the iOS project.

For Android:

```bash
npm run android:sync
```

To regenerate both platforms at once:

```bash
npm run mobile:sync
```

## One-time setup (on macOS)

1. Install Ruby Bundler if needed:

```bash
gem install bundler
```

2. Install Fastlane gems:

```bash
npm run ios:testflight:setup
```

3. Create local env file from the template:

- Copy `ios/App/fastlane/.env.testflight.example` to `ios/App/fastlane/.env.testflight`
- Fill in real values

4. Ensure the `.p8` key file path in `APP_STORE_CONNECT_KEY_PATH` is correct.

## Required values

- `APPLE_TEAM_ID` (10-char Team ID)
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_PATH` (absolute path to `.p8`)
- Optional: `APPLE_ID`, `APP_STORE_CONNECT_TEAM_ID`

## Usage

Build-only validation:

```bash
npm run ios:testflight:validate
```

Upload to TestFlight:

```bash
npm run ios:testflight
```

## Current app target settings

- Bundle ID: `com.cardswipers.app`
- Xcode scheme: `App`
- Xcode workspace: `ios/App/App.xcworkspace`

## Notes

- Run TestFlight commands on a Mac with Xcode installed.
- The lane auto-increments iOS build number before upload.
- Upload defaults to internal TestFlight processing (`distribute_external: false`).
