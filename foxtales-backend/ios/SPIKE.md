# Spike: does background audio survive inside an App Clip?

**This is the one load-bearing unknown for the whole App Clip rung** (spec
Decision 6). App Clips are barred from general background execution. Whether an
active `.playback` `AVAudioSession` keeps playing when the screen locks — and
whether the Now Playing / Control Center controls work *inside a clip* — is not
clearly documented by Apple and must be verified on a real device before the
clip is treated as the tap-to-play surface.

Time-box: **~1 day.** Everything the spike needs is already wired
(`UIBackgroundModes: [audio]` in `Clip/Info.plist`, the `.playback` session in
`FoxTalesCore/NowPlaying.swift`).

## Setup

1. A physical iPhone (not the Simulator — background/lock behavior differs).
2. `cd foxtales-backend/ios && make open`; set your team for **both** targets.
3. A reachable backend with at least one **ready** story and a card token. Point
   `FoxTalesBaseURL` (in `Clip/Info.plist`) at that origin if it isn't
   `foxtales.app` yet.
4. Register a **Local Experience** on the device (Settings → Developer → Local
   Experience): URL prefix `https://foxtales.app/p/`, the clip's bundle ID
   `app.foxtales.ios.Clip`. (Or build & run the `FoxTalesClip` scheme directly
   and open the capability URL.)

## The test

Launch the clip from the card/Local Experience so the story autoplays, then:

| # | Action | Pass criteria |
| --- | --- | --- |
| 1 | Let it play 10s in the foreground | Audio plays; scrubber advances |
| 2 | **Lock the screen** | Audio **keeps playing** uninterrupted |
| 3 | Look at the lock screen | **Now Playing** shows title/artist; artwork area present |
| 4 | Use lock-screen **play/pause** | Toggles playback |
| 5 | Use lock-screen **scrubber** | Seeks |
| 6 | Switch to another app, play its audio, return | Session interruption handled (resumes or stops cleanly, no crash) |
| 7 | Let the story play to the end while locked | Completes; no mid-story kill |

Capture a short screen recording of steps 2–5 as the evidence.

## Verdict → decision

- **All green** → the App Clip becomes the tap-to-play surface. Proceed to
  register the App Store Connect experience. Update
  `docs/appclip-experience.md` (remove the "⚠ verify" caveat on screen-locked
  playback) and `NowPlaying.swift` (drop the spike warning).
- **Audio dies on lock (step 2) or controls dead (3–5)** → the clip is still fine
  for **screen-on** play, but screen-off listening must fall back to:
  - the **Safari web player** (already shipped, acceptable), or
  - the **full app** (background audio is unrestricted there).
  Record the failure mode here and keep the clip scoped to screen-on.

## Notes to record

- iOS version tested:
- Device:
- Result per step (1–7):
- Screen recording link:
- Decision:
