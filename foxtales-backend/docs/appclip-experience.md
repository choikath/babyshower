# The App Clip experience — iOS instant play, Android fallback

How a single NFC tap becomes a playing story, why iOS and Android diverge, what
it takes to turn on the App Clip, and what families actually feel when it's on.

This is the product/architecture view of spec **Decision 6** (playback surface).
For build mechanics see [`../ios-appclip/README.md`](../ios-appclip/README.md);
for the backend that serves it, [`../README.md`](../README.md).

## The one fact everything hangs on

The NFC tag stores **only** one opaque URL — `https://foxtales.app/p/<token>`
([`README.md` › NFC tags](../README.md)). It never changes. The same tap
produces a different experience purely from what the **device's OS** and the
**resolver's content negotiation** do with that URL.

The resolver forks on the `Accept` header (`src/routes/resolver.ts:18`):

```
                                  Accept: application/json
  NFC tag  ──►  GET /p/<token>  ──┬──────────────────────────►  { story, stream:{ signedURL } }   ← App Clip / native
  (token only)                   │                                                                   autoplay on launch
                                 │  Accept: text/html
                                 └──────────────────────────►  302  /play/<token>  ──►  web player  ← Safari / Android
                                                                                                       must tap ▶
```

That single fork is the whole iOS-vs-Android story. One tag, one URL; the OS
decides the rung.

## The decisive constraint: web audio cannot autoplay

iOS Safari (and Android Chrome) require a **user gesture on the page** before
audio starts — and arriving from the NFC banner doesn't count. A **native**
target launched from the same Universal Link *may* start `AVPlayer` immediately.
This is Apple policy, not an engineering gap, and it's the entire reason the App
Clip rung exists.

| | Web (Safari / Android) | App Clip (native) |
| --- | --- | --- |
| Path | tap card → tap banner → page loads → **tap ▶** | tap card → tap clip card → *playing* |
| Interactions | 3 | 2 |
| Time to audio | ~5–8 s | ~2–3 s |
| Autoplay on arrival | ❌ | ✅ |

## 1. The App Clip experience (iOS)

Tap card → iOS reads the tag → an **App Clip card** slides up over whatever's on
screen → one tap launches a small native slice in ~1–2 s, **no App Store visit,
no account** → the story is *already playing*.

The code path:

1. The tap delivers the URL as a Universal Link activity; the clip catches it
   (`ios-appclip/FoxTalesClipApp.swift:20`, `onContinueUserActivity`) and
   extracts the 22-char token.
2. It calls `GET /p/<token>` with `Accept: application/json`
   (`ios-appclip/StoryService.swift:36`) and decodes the story metadata plus a
   short-lived **signed** MP3 URL.
3. The player loads `.onAppear` and **autoplays immediately**
   (`ios-appclip/PlayerView.swift:53,90` — `play() // autoplay on launch`). No
   "tap ▶", because a native target launched from the link is *allowed* to start
   playback on launch.
4. Lock-screen **Now Playing** controls, Control Center transport, and the
   Dynamic Island light up for free the moment the native player runs
   (`ios-appclip/NowPlaying.swift`).

**Net: 2 interactions, ~2–3 s.**

## 2. The fallback for Android (and any phone without the clip)

Android has no App Clips, so it stays on the permanent floor — the web player:

1. Tap card → Android reads the NDEF URL natively and surfaces an "open link"
   notification/banner → tap → Chrome opens `https://foxtales.app/p/<token>`.
2. Chrome sends `Accept: text/html`, so the resolver `302`-redirects to
   `/play/<token>` (`src/routes/resolver.ts:20`) → the branded letterpress web
   player.
3. **The user taps ▶ once.** Browser autoplay policy requires a gesture on the
   page; the NFC banner doesn't count. Policy, not a bug we can patch.

**Net: 3 interactions, ~5–8 s.**

The same web player is *also* the iOS fallback: if the clip isn't built/registered
yet, or background audio fails the spike (below), iOS Safari lands here too. So
**tap-to-play works on every phone today**, before any App Clip exists. The App
Clip is an iOS *upgrade rung*, not a prerequisite.

## 3. What it takes to turn on the App Clip

The **backend is already done.** It serves the JSON face, the signed stream, and
an AASA file (`src/routes/aasa.ts`) that already lists both the full app
(`applinks` on `/p/*`) and the App Clip (`appclips.apps`). The remaining work is
almost entirely Apple-side plus one validation:

1. **Apple Developer account + Xcode.** The backend repo cannot build/sign an iOS
   target — this is the gate.
2. **Create the targets:** an iOS app (`app.foxtales.ios`) and an App Clip target
   (`app.foxtales.ios.Clip`); drop the scaffold Swift files
   (`FoxTalesClipApp`, `StoryService`, `PlayerView`, `NowPlaying`) into the clip.
3. **Associated Domains entitlement** on the clip: `appclips:foxtales.app` —
   already in `ios-appclip/FoxTalesClip.entitlements`; must match the AASA host.
4. **App Store Connect → App Clip → default experience** with URL prefix
   `https://foxtales.app/p/`.
5. **Set the real origin:** `FoxTales.baseURL` in
   `ios-appclip/StoryService.swift:26`, and the Apple identifiers in the backend
   env (`APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `APPCLIP_BUNDLE_ID`) so the AASA renders
   correctly.
6. **Deploy so the AASA serves cleanly:** HTTPS at the domain apex,
   `application/json`, **no redirect** (Apple fetches it directly). The service
   does this right — just don't let a CDN rewrite the path or content-type.
7. **Keep the clip under its size budget** — no heavy dependencies; the scaffold
   player is deliberately tiny.
8. **⚠️ Run the load-bearing spike first.** This is the *one genuine unknown*
   (`ios-appclip/NowPlaying.swift:7-13`, spec Decision 6). App Clips are barred
   from general background execution, and it is **not documented** whether an
   active `.playback` audio session survives screen-lock *inside a clip*. The
   mechanics are already wired (`UIBackgroundModes: [audio]` in
   `ios-appclip/Info.plist.example`, the `.playback` session in `NowPlaying.swift`),
   but must be validated on a physical device:
   - audio keeps playing when the screen locks, and
   - Now Playing / Control Center controls work inside the clip.

   If it passes, the App Clip covers tap-to-play almost entirely. If it fails,
   screen-off listening falls back to Safari (acceptable) or the full app, and the
   clip is still fine for screen-on play.

Roughly a one-day spike plus standard Xcode / App Store Connect setup. There is
**zero throwaway work** — the clip *is* the full app's player module shipped
early, a shared SwiftUI target with a built-in upsell surface to the full app.

## 4. What families actually feel

- **It feels like magic, not software.** Tap the card and the story is *already
  playing* — no install, no account, no "tap play." That eliminated middle tap is
  the entire emotional unlock for a tap-to-play bedtime product.
- **Faster, fewer steps:** 2 taps / ~2–3 s vs 3 taps / ~5–8 s. For a small child
  working the card, every removed step matters.
- **Zero install friction.** No App Store trip, no Add-to-Home-Screen (high
  friction on iOS). The card summons the clip; iOS may evict an unused clip after
  ~30 days, but the next tap silently re-summons it — invisible to the family.
- **Real lock-screen presence.** Native Now Playing controls + Dynamic Island
  appear automatically — pause/scrub from the lock screen, richer than the web's
  MediaSession.
- **More robust screen-locked listening** (pending the spike) — a native
  `.playback` session is sturdier than Safari's, which usually continues but isn't
  guaranteed.
- **Kid-proofing.** Full-screen native, no Safari chrome to wander out of mid-story.

## The honest caveat

The App Clip is an **enhancement layered on a fallback that already works.** The
web player ships today and covers every phone — including all of Android, which
gets no App Clip. The App Clip is purely the iOS "instant + native" upgrade, and
committing to it is gated on that one background-audio spike passing.

## The ladder, at a glance

| | Web (Safari) | App Clip | Full app |
| --- | --- | --- | --- |
| Install friction | none | none — card invokes it | App Store install |
| Taps to audio | 3 | 2 | 2 |
| Autoplay on arrival | ❌ | ✅ | ✅ |
| Lock-screen controls | MediaSession | native Now Playing | Now Playing + Dynamic Island |
| Screen-locked playback | usually continues | ⚠ verify — the spike | ✅ |
| Offline playback | unreliable | ephemeral cache only | ✅ downloads |
| Push notifications | ❌ | ❌ | ✅ |
| Kid-proofing | Safari chrome, can wander | full-screen native | full-screen native + child mode |
| Build cost | ships already | shares the app's player module | full spec |

Phase 1 is not "app vs. no app" — it's **which rung to stop at**: the web player
ships as the permanent floor; the App Clip spike, if green, becomes the iOS
tap-to-play surface; the full app is justified later by what playback alone never
justifies — offline reliability, push, playlists, in-app recording, child mode.
