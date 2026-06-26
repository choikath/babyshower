import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ah } from "../http.js";
import { authorizeFamilyRead, requireAuth, HttpError } from "../auth.js";
import { resolveToken } from "../resolve.js";
import { getRepo } from "../repo.js";
import { getStorage } from "../storage/index.js";
import { ipLimiter } from "../ratelimit.js";

export const notesRouter: Router = Router();

// Where a memo's audio lives in the private bucket (mirrors the stories layout).
const voiceNoteKey = (familyId: string, id: string, ext: string) =>
  `families/${familyId}/voice-notes/${id}/audio.${ext}`;

// Recorder containers we accept. MediaRecorder emits webm (Chromium) or mp4 (Safari);
// keep the allowlist tight so the key extension is always something sane.
const EXTS = new Set(["webm", "mp4", "m4a", "ogg", "mp3", "wav"]);
const safeExt = (e: string | undefined): string => {
  const x = String(e ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return EXTS.has(x) ? x : "webm";
};

/**
 * Begin a voice memo: resolve the tapped capability token to its card/story/family,
 * create a processing row, and hand back a signed PUT URL for the audio. No auth —
 * the capability token *is* the authorization (anyone who can tap the card can leave
 * a memo), exactly like the public player resolve.
 */
notesRouter.post(
  "/voice-notes",
  ipLimiter,
  ah(async (req: Request, res: Response) => {
    const body = z
      .object({
        token: z.string().min(1).max(64),
        senderName: z.string().max(80).optional(),
        message: z.string().max(1000).optional(),
        ext: z.string().max(8).optional(),
        durationSec: z.number().nonnegative().max(3600).optional(),
      })
      .parse(req.body);

    const result = await resolveToken(body.token, { bump: false });
    if (result.kind === "not_found") throw new HttpError(404, "not_found");
    if (result.kind === "revoked") throw new HttpError(410, "revoked");
    // unlinked / processing / ready all carry a card → a family to file the memo under.
    const card = result.card;
    const story = "story" in result ? result.story : null;

    const repo = await getRepo();
    const storage = await getStorage();
    const id = randomUUID();
    const ext = safeExt(body.ext);
    const key = voiceNoteKey(card.familyId, id, ext);

    const note = await repo.createVoiceNote({
      id,
      familyId: card.familyId,
      originCardId: card.id,
      originStoryId: card.storyId ?? null,
      originToken: body.token,
      readerName: story?.fromName ?? null,
      senderName: body.senderName?.trim() || null,
      message: body.message?.trim() || null,
      audioKey: key,
      ext,
      durationSec: body.durationSec ?? null,
    });

    const up = await storage.getSignedUploadUrl(key);
    res.status(201).json({
      voiceNote: { id: note.id, status: note.status },
      upload: { url: up.url, method: up.method, key },
    });
  }),
);

/** Confirm the upload landed and flip the memo to `ready` so the inbox shows it. */
notesRouter.post(
  "/voice-notes/:id/finalize",
  ipLimiter,
  ah(async (req: Request, res: Response) => {
    const body = z.object({ durationSec: z.number().nonnegative().max(3600).optional() }).parse(req.body);
    const repo = await getRepo();
    const note = await repo.getVoiceNote(req.params.id!);
    if (!note) throw new HttpError(404, "voice_note_not_found");
    const updated = await repo.markVoiceNoteReady(note.id, { durationSec: body.durationSec ?? note.durationSec ?? null });
    res.json({ voiceNote: { id: updated!.id, status: updated!.status } });
  }),
);

/** The family's Voice Memo Inbox. Member — or an allowlisted admin email (ADMIN_EMAILS). */
notesRouter.get(
  "/voice-notes",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const familyId = z.string().uuid().parse(req.query.familyId);
    await authorizeFamilyRead(req, familyId);
    const repo = await getRepo();
    const notes = await repo.listVoiceNotesForFamily(familyId);
    res.json({
      voiceNotes: notes
        .filter((n) => n.status === "ready")
        .map((n) => ({
          id: n.id,
          senderName: n.senderName,
          readerName: n.readerName,
          message: n.message,
          durationSec: n.durationSec,
          playedAt: n.playedAt,
          createdAt: n.createdAt,
        })),
    });
  }),
);

/** Short-lived signed URL to play a memo in the admin inbox. Marks it heard. */
notesRouter.get(
  "/voice-notes/:id/stream",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const repo = await getRepo();
    const note = await repo.getVoiceNote(req.params.id!);
    if (!note) throw new HttpError(404, "voice_note_not_found");
    await authorizeFamilyRead(req, note.familyId);
    if (note.status !== "ready" || !note.audioKey) throw new HttpError(409, "voice_note_not_ready");
    const storage = await getStorage();
    const signed = await storage.getSignedStreamUrl(note.audioKey);
    repo.touchVoiceNotePlayed(note.id).catch(() => {});
    res.json({ url: signed.url, expiresAt: signed.expiresAt });
  }),
);
