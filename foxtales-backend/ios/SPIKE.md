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

> **Where this stands:** foreground playback is already validated — the clip
> resolves a real card against the live backend and plays it in the **Simulator**.
> The Simulator does *not* faithfully reproduce screen-lock / background-audio
> suspension, so the question below is still open and needs a physical device.
> Web searches confirm the general iOS rule (`.playback` + the `audio` background
> mode keeps audio alive when locked) but turn up **no App Clip-specific answer** —
> Apple doesn't document it, so this hands-on test is the only way to settle it.

## Setup

1. A physical iPhone (not the Simulator — background/lock behavior differs).
2. `cd foxtales-backend/ios && make open`; set your team for **both** targets.
3. A reachable backend with at least one **ready** story and a card token.
   `FoxTalesBaseURL` (in `Clip/Info.plist`) already points at the live backend
   (`https://foxtales-backend.fly.dev`); change it only if the backend moves.
4. **A paid Apple Developer Program membership.** App Clip targets carry the
   `parent-application-identifiers` + associated-domains capabilities, which do
   **not** provision on a free Apple ID — so the clip can't be run on a device
   without it. (The full app could, but that wouldn't test the clip's sandbox.)
5. Get the clip running on the device by either:
   - **Direct run — simplest, and the exact path we validated in the Simulator:**
     select the `FoxTalesClip` scheme, then Edit Scheme → Run → Arguments → set
     env var `_XCAppClipURL` to a real card URL
     (`https://foxtales-backend.fly.dev/p/<token>`), pick the connected iPhone,
     and Run. The story autoplays.
   - **Local Experience — closest to a real tap:** Settings → Developer → Local
     Experience, URL prefix `https://foxtales-backend.fly.dev/p/`, clip bundle ID
     `app.foxtales.ios.Clip`, then tap a real tag.

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
