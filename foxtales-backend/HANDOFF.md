# FoxTales — project handoff (paused, shipping as-is)

_Last updated: 2026-06-24._

The gift **works and is shippable today.** The only deferred item is one optional
iOS polish test (Milestone 3), captured below as a ~1-day task.

## What's live

- **Backend:** `https://foxtales-backend.fly.dev` (Fly.io) — resolves cards and
  serves the web player + short-lived signed audio URLs.
- **Frontend:** `foxtales.app` (GitHub Pages — see repo-root `index.html` / `CNAME`).
- **Cards:** tap (NFC) or scan (QR) `https://foxtales-backend.fly.dev/p/<token>`
  → the phone's browser opens the **web player** and the story plays. Universal
  path: no app, no install, no account, works on iOS and Android.

## iOS App Clip — a proven bonus on top of the web player

Native two-target Xcode project in [`ios/`](ios/) (the `ios-appclip/` dir is just
a redirect). Shared player module `FoxTalesCore`; thin app + clip entry points.

- ✅ **M1 — web player:** works on any phone.
- ✅ **M2 — clip plays in the Simulator:** the App Clip resolves a real card
  against the live backend and autoplays it. Foreground playback validated.
- ⏸ **M3 — DEFERRED:** does `.playback` audio survive **screen-lock inside a
  clip**? Apple doesn't document it; only a physical-device test answers it.

### Resuming M3 (the ~1-day task)

Needs a **physical iPhone + a paid Apple Developer Program membership** ($99/yr —
App Clip targets won't provision on a free Apple ID). Full runbook:
[`ios/SPIKE.md`](ios/SPIKE.md). In short: set your Team in Xcode → run the
**FoxTalesClip** scheme on the iPhone with the `_XCAppClipURL` env var pointed at
a real card URL → play, lock the screen, check audio + the lock-screen controls.

**If M3 fails, nothing breaks:** screen-off listening falls back to the web
player (already shipped), and the clip still gives the fastest screen-on
tap-to-play.

## Domains / config

Cards and the app currently use the backend host `foxtales-backend.fly.dev` — set
in both `ios/*/Info.plist` (`FoxTalesBaseURL`) and the associated-domains
entitlements. For an eventual App Store launch, prefer a **custom domain** you
control over `*.fly.dev`, and update those spots plus the served AASA together.

## Git state

- `master` — the tested, working build (what plays in the Simulator).
- `claude/fervent-fermat-5lfach` — `master` + the M3-prep commit (entitlements +
  doc alignment) + this handoff. It lives here because direct pushes to `master`
  are gated in the dev environment; fold it into `master` (or open a PR) whenever
  convenient.
