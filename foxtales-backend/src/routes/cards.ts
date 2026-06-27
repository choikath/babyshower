import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { ah } from "../http.js";
import { assertFamilyRole, authorizeContribution, optionalAuth, requireAuth, HttpError } from "../auth.js";
import { getRepo } from "../repo.js";
import { generateToken } from "../token.js";
import { ipLimiter } from "../ratelimit.js";

export const cardsRouter: Router = Router();

function capabilityUrl(token: string): string {
  return `${env.PUBLIC_BASE_URL}/p/${token}`;
}

/** Mint a blank card and its capability token. The returned URL is what the app
 * writes to the NFC tag, then locks (spec 1.3). Owner only. */
cardsRouter.post(
  "/cards",
  ipLimiter,
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    const body = z
      .object({ familyId: z.string().uuid(), sessionId: z.string().max(64).optional(), deviceId: z.string().max(64).optional() })
      .parse(req.body);
    await authorizeContribution(req, body.familyId, ["owner"]);
    const repo = await getRepo();
    const token = generateToken();
    const card = await repo.createCard({ familyId: body.familyId, token });
    repo.insertEvents([{
      event: "card_minted", source: "server", flow: "record_own", step: "finish",
      sessionId: body.sessionId ?? null, deviceId: body.deviceId ?? null, userId: req.userId ?? null,
      familyId: body.familyId, props: { cardId: card.id },
    }]).catch(() => {});
    res.status(201).json({ cardId: card.id, token: card.token, capabilityUrl: capabilityUrl(card.token) });
  }),
);

/** List a family's cards with their linked story title (the "My cards" screen). Member. */
cardsRouter.get(
  "/cards",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const familyId = z.string().uuid().parse(req.query.familyId);
    await assertFamilyRole(req.userId!, familyId, ["owner", "member"]);
    const repo = await getRepo();
    const cards = await repo.listCardsForFamily(familyId);
    const out = await Promise.all(
      cards.map(async (c) => {
        const story = c.storyId ? await repo.getStory(c.storyId) : null;
        return {
          id: c.id,
          token: c.token,
          capabilityUrl: capabilityUrl(c.token),
          storyId: c.storyId,
          storyTitle: story?.title ?? null,
          locked: c.locked,
          revoked: Boolean(c.revokedAt),
          lastTappedAt: c.lastTappedAt,
          createdAt: c.createdAt,
        };
      }),
    );
    res.json({ cards: out });
  }),
);

/** Point a card at a story. Re-pointing is allowed but deliberate (Decision 2). Owner. */
cardsRouter.post(
  "/cards/:id/link",
  ipLimiter,
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    const body = z
      .object({ storyId: z.string().uuid(), sessionId: z.string().max(64).optional(), deviceId: z.string().max(64).optional() })
      .parse(req.body);
    const repo = await getRepo();
    const card = await repo.getCard(req.params.id!);
    if (!card) throw new HttpError(404, "card_not_found");
    await authorizeContribution(req, card.familyId, ["owner"]);
    const story = await repo.getStory(body.storyId);
    if (!story || story.familyId !== card.familyId) throw new HttpError(400, "story_not_in_family");
    const updated = await repo.linkCard(card.id, story.id);
    repo.insertEvents([{
      event: "card_linked", source: "server", flow: "record_own", step: "finish",
      sessionId: body.sessionId ?? null, deviceId: body.deviceId ?? null, userId: req.userId ?? null,
      familyId: card.familyId, props: { cardId: card.id, storyId: story.id },
    }]).catch(() => {});
    res.json({ card: { id: updated!.id, storyId: updated!.storyId } });
  }),
);

/** Record that the physical tag was write-locked (the CoreNFC lock happens on-device). Owner. */
cardsRouter.post(
  "/cards/:id/lock",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const repo = await getRepo();
    const card = await repo.getCard(req.params.id!);
    if (!card) throw new HttpError(404, "card_not_found");
    await assertFamilyRole(req.userId!, card.familyId, ["owner"]);
    const updated = await repo.setCardLocked(card.id, true);
    res.json({ card: { id: updated!.id, locked: updated!.locked } });
  }),
);

/** Kill switch for a lost or misused card — the token stops resolving (spec 1.4). Owner. */
cardsRouter.post(
  "/cards/:id/revoke",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const repo = await getRepo();
    const card = await repo.getCard(req.params.id!);
    if (!card) throw new HttpError(404, "card_not_found");
    await assertFamilyRole(req.userId!, card.familyId, ["owner"]);
    const updated = await repo.revokeCard(card.id);
    res.json({ card: { id: updated!.id, revoked: Boolean(updated!.revokedAt) } });
  }),
);
