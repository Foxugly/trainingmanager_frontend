# Android App Links — `assetlinks.json`

HTTPS deep links (`https://tm.foxugly.com/auth/...`, `/invitation/...`) open the
**TrainingManager mobile app** directly instead of the browser, but only if this
domain proves it is associated with the app via a Digital Asset Links file.

## Where it lives / how it's served
- Source: [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json).
- Angular copies `public/` to the build root (`angular.json` → `assets[].input: "public"`),
  so it ships at `dist/.../browser/.well-known/assetlinks.json`.
- nginx (`deploy/nginx/tm-frontend.conf`, `location /` → `try_files $uri …`) serves the
  real file before the SPA fallback, with `Content-Type: application/json` (from the
  `.json` extension). **No extra nginx rule needed.**
- Must be reachable anonymously at `https://tm.foxugly.com/.well-known/assetlinks.json`
  with no redirect.

## Signing fingerprints (`sha256_cert_fingerprints`)
Android verifies the app's **signing certificate** SHA-256 against this list. A file
may list several fingerprints — add each signing identity you ship with:

| Identity | When | How to get the SHA-256 |
|---|---|---|
| **debug** (currently listed) | local testing with a debug build | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` |
| **release** | distribution / sideloaded release build | `keytool -list -v -keystore <release.jks> -alias <alias>` — *no TM release keystore exists yet* |
| **Play App Signing** | once on Google Play | Play Console → Setup → App signing → SHA-256 |

> The value committed here is the **debug** fingerprint of the dev machine. Append the
> **release** (and Play) fingerprints to the `sha256_cert_fingerprints` array when the
> release keystore is created — App Links then work on release builds too.

## iOS (later, needs a Mac)
iOS Universal Links need `/.well-known/apple-app-site-association` (no extension →
requires an nginx `location` to force `application/json`) plus the Associated Domains
entitlement in the iOS target. Tracked with the iOS chantier; see the app repo spec
`docs/superpowers/specs/2026-06-29-deep-link-ops-prereq.md`.

## Paths covered by the app's intent-filters
`/auth/magic-link/*`, `/auth/confirm-email/*`, `/auth/reset-password/*`, `/invitation/*`
(keep in sync with the Android manifest `pathPrefix` and `parseDeepLink`).

## Test
`e2e/assetlinks.spec.ts` asserts the file is served at the well-known path with the
right content-type and a valid Android association (package + non-empty fingerprints).
