# Audio branding (admin-only)

A shared **intro jingle**, **intro**, and **outro** that get stitched into every
recorded story. Managed from `https://foxtales.app/admin` by one admin account
(`choikath@gmail.com`); nobody else sees the controls, and visitors to the site
root never see them at all.

## What the recorder produces

Each story is mixed **in the browser** into a single MP3. With all three clips
uploaded, the timeline is:

```
0:00  ── intro jingle (full for 8s)
0:08  ── recorded greeting starts; jingle fades out over 7s (they overlap)
 ···  ── 0.5s after the greeting ends → branded intro (its last 5s fade out)
 ···  ── the story (all recorded parts + the recorded sign-off)
 ···  ── 5s before the story ends → outro jingle fades in over 10s (overlap),
         plays, then fades out over its last 8s
```

Every clip is **optional**. Any slot you leave empty is simply skipped, and a
recording made with *no* branding uploaded comes out exactly as it did before
this feature existed. Branded clips are loudness-matched to the recorded voice so
nothing overpowers the greeting or the story during the overlaps.

All timing/fade values are constants in `index.html` (`const MIX = { … }`), so
they're easy to tune without re-exporting any audio.

## One-time setup

The three files live in a **public** Supabase Storage bucket named `branding`,
with a Row-Level-Security policy that lets **only the admin email** write to it.
Run [`foxtales-branding-setup.sql`](foxtales-branding-setup.sql) once in the
Supabase SQL editor (Dashboard → SQL editor → paste → Run).

> The admin email is defined in two places that must match:
> `ADMIN_EMAILS` in `index.html` and the email in `foxtales-branding-setup.sql`.

## Using it

1. Go to `https://foxtales.app/admin` and sign in with the admin email
   (one-time code by email).
2. In **“Intro & outro audio”**, upload an MP3 or M4A for each slot. Files are
   transcoded to mono MP3 and stored at fixed keys (`jingle.mp3`, `intro.mp3`,
   `outro.mp3`), so the recorder just fetches three known URLs.
3. Preview, **Replace**, or **Remove** any slot at any time. Changes apply to the
   next story anyone records.

## Notes

- **"Hear it as they will" previews the final, branded mix** — the storyteller
  hears exactly what gets saved (jingle / intro / outro and the fades), so the
  preview matches the delivered MP3. Until you upload any clips, both the preview
  and the final MP3 are byte-for-byte what they were before this feature.
- **Where the splice happens:** the segments (greeting, story parts, recorded
  sign-off) are joined in the browser at the moment a story is finished — that's
  the only place they exist as separate pieces, which is what lets the branded
  *intro* be inserted *between* the greeting and the story. The server only ever
  receives the finished MP3.
- Branding applies to the **story** recorder only — quick **voice notes** are
  never wrapped.
