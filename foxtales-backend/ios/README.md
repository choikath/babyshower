# FoxTales iOS — app + App Clip

A buildable two-target Xcode project: the **FoxTales** full app and the
**FoxTales App Clip**, both rendering one shared player module
(`Packages/FoxTalesCore`). Tap a tag → the clip launches → the story autoplays,
with no install and no account (spec **Decision 6**). The Safari web player
served by the backend stays the permanent fallback for every other phone.

> Building, signing, and the on-device spike require **macOS + Xcode + an Apple
> Developer account**. They cannot be done from the backend container. This
> directory is the turn-key handoff: the project is fully defined; the Mac steps
> are *generate → set team → build → spike*.

## Layout

```
ios/
  project.yml                 XcodeGen spec — source of truth (the .xcodeproj is generated, not committed)
  Makefile                    make project | open | build-app | build-clip | test
  App/                        full app target (thin: hosts the clip, routes Universal Links)
    FoxTalesApp.swift, AppRootView.swift, Info.plist, FoxTales.entitlements
  Clip/                       App Clip target (thin: resolve -> play)
    FoxTalesClipApp.swift, Info.plist, FoxTalesClip.entitlements
  Shared/Assets.xcassets      app icon / assets shared by both targets
  Packages/FoxTalesCore/      the shared player module (the "zero throwaway work" core)
    Models, Config, StoryService, CardLink, PlayerEngine, NowPlaying,
    PlayerView, MessageView, PlaybackView   (+ FoxTalesCoreTests)
  SPIKE.md                    the load-bearing background-audio validation runbook
```

**Why a shared package.** The clip *is* the app's player module shipped early.
`FoxTalesCore` holds every line of resolve/play/lock-screen logic; the two targets
are just `@main` entry points plus deep-link plumbing. No duplication, and the
full app inherits the player for free as it grows.

## Prerequisites

- Xcode 15 or newer.
- [XcodeGen](https://github.com/yonyon/XcodeGen): `brew install xcodegen`.
- For device installs / App Clip testing: an Apple Developer account and a team
  set in **Signing & Capabilities**.

## Build & run

```bash
cd foxtales-backend/ios
make open            # xcodegen generate + open FoxTales.xcodeproj
# or, headless compile (Simulator needs no signing):
make build-app
make test            # FoxTalesCore unit tests
```

The generated `FoxTales.xcodeproj` is git-ignored on purpose — edit `project.yml`
and regenerate, never hand-edit the pbxproj.

To run on a device: select the **FoxTales** scheme, pick your team under Signing
& Capabilities for *both* targets, build to the device, then test the clip via a
Local Experience (below).

## Configuration

| What | Where | Default |
| --- | --- | --- |
| Bundle IDs | `project.yml` (`app.foxtales.ios`, `…​.Clip`) | match backend `IOS_BUNDLE_ID` / `APPCLIP_BUNDLE_ID` |
| Associated domain | `App/FoxTales.entitlements` (`applinks:`), `Clip/FoxTalesClip.entitlements` (`appclips:`) | `foxtales.app` |
| Resolver origin | `FoxTalesBaseURL` in each `Info.plist` (read by `FoxTalesConfig`) | `https://foxtales.app` |
| Team / signing | Xcode → Signing & Capabilities, or `DEVELOPMENT_TEAM` in `project.yml` | unset |

Change the domain in **three** places consistently: both entitlements files and
your deployed AASA host. The backend already serves a correct
`/.well-known/apple-app-site-association` listing both the app (`applinks` on
`/p/*`) and the clip (`appclips`) — see `src/routes/aasa.ts`.

## How it maps to the backend

- The clip calls `GET /p/<token>` with `Accept: application/json`
  (`FoxTalesCore/StoryService.swift`) and gets `{ story, stream:{ signedURL } }`.
  Browsers send `text/html` and are 302'd to the web player instead — that single
  content-negotiation fork is the iOS-vs-Android split (`src/routes/resolver.ts`).
- The tag stores only `https://foxtales.app/p/<token>`; the signed MP3 URL is
  short-lived and never on the tag.
- Token shape (22-char base62) is validated in `CardLink.swift` to mirror
  `src/token.ts`.

See [`../docs/appclip-experience.md`](../docs/appclip-experience.md) for the
product/architecture narrative.

## Testing the App Clip without shipping

Use a **Local Experience** (Settings → Developer → Local Experience, or the
scheme's *App Clip → Local Experience* on a connected device): register URL
prefix `https://foxtales.app/p/` and the clip's bundle ID, then tap a real tag
(or scan a generated App Clip code). This exercises the launch path before the
App Store experience is registered in App Store Connect.

## Before you commit to the App Clip rung

Run [`SPIKE.md`](SPIKE.md) — the one genuine unknown is whether `.playback`
audio survives screen-lock *inside an App Clip*. If it passes, the clip covers
tap-to-play almost entirely. If it fails, screen-off listening falls back to
Safari or the full app, and the clip is still the fastest screen-on play.

## Status / next steps

- [x] Shared player module, both target entry points, deep-link routing.
- [x] Project definition, entitlements, Info.plists, AASA already served by backend.
- [ ] Generate + build in Xcode; resolve any SwiftPM/signing nits on a Mac.
- [ ] **Run the background-audio spike** (`SPIKE.md`) on a physical device.
- [ ] Register the App Clip experience in App Store Connect (prefix `https://foxtales.app/p/`).
- [ ] App icon art (placeholder `AppIcon` set is empty).
- [ ] Full-app features that justify it beyond the clip: offline, push, recording, child mode.
