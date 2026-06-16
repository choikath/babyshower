# FoxTales App Clip (scaffold)

A compact SwiftUI App Clip that turns a tag tap into instant playback. It is a
**starting point**, not a finished target: building, signing, and shipping it
requires Xcode and an Apple Developer Program membership, which can't be done
from this backend repo.

## What's here

| File | Role |
| --- | --- |
| `FoxTalesClipApp.swift` | Entry point; receives the Universal Link activity and extracts the `/p/<token>` token. |
| `StoryService.swift` | Calls the resolver's JSON face (`GET /p/<token>`, `Accept: application/json`) and decodes `{ story, stream }`. |
| `PlayerView.swift` | Minimal player — AVPlayer, autoplay on launch, scrubber, play/pause. |
| `NowPlaying.swift` | Lock-screen metadata, Control Center transport, and the `.playback` audio session. |
| `FoxTalesClip.entitlements` | Associated domains (`appclips:foxtales.app`). |
| `Info.plist.example` | Background audio mode + the `NSAppClip` marker. |

The JSON shapes in `StoryService.swift` match what the backend returns, so once
the target builds and the association is live, resolve → play should work
against your deployed `PUBLIC_BASE_URL`.

## What you must do in Xcode / App Store Connect

1. Create an iOS app target (`app.foxtales.ios`) and add an **App Clip** target
   (`app.foxtales.ios.Clip`). Drop these files into the clip target.
2. Set the clip's **Associated Domains** entitlement to `appclips:foxtales.app`
   (must match the host serving the AASA file).
3. In **App Store Connect → your app → App Clip**, configure the default App Clip
   experience with the URL prefix `https://foxtales.app/p/`.
4. Set `FoxTales.baseURL` in `StoryService.swift` to your real origin.
5. Keep the clip tiny — App Clips have a strict uncompressed size budget. No heavy
   dependencies; the player above is intentionally small.

## ⚠️ The load-bearing spike

Before committing to the App Clip route, **verify on a physical device** that:

- audio **keeps playing when the screen locks**, and
- the **Now Playing / Control Center** controls work *inside an App Clip*.

App Clips are constrained (no general background execution, tight memory). The
whole "tap and listen" experience rests on background audio behaving here. This
is the one genuine unknown (spec Decision 6) — spike it first. The permanent
Safari web player (served by this backend at `/play/<token>`) is the fallback
either way, so tap-to-play works on every phone even before the clip ships.
