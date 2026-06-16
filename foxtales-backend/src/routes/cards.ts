import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { ah } from "../http.js";
import { assertFamilyRole, HttpError } from "../auth.js";
import { getRepo } from "../repo.js";
import { generateToken } from "../token.js";

export const cardsRouter: Router = Router();

function capabilityUrl(token: string): string {
  return `${env.PUBLIC_BASE_URL}/p/${token}`;
}

/** Mint a blank card and its capability token. The returned URL is what the app
 * writes to the NFC tag, then locks (spec 1.3). Owner only. */
cardsRouter.post(
  "/cards",
  ah(async (req: Request, res: Response) => {
    const body = z.object({ familyId: z.string().uuid() }).parse(req.body);
    await assertFamilyRole(req.userId!, body.familyId, ["owner"]);
    const repo = await getRepo();
    const token = generateToken();
    const card = await repo.createCard({ familyId: body.familyId, token });
    res.status(201).json({ cardId: card.id, token: card.token, capabilityUrl: capabilityUrl(card.token) });
  }),
);

/** List a family's cards with their linked story title (the "My cards" screen). Member. */
cardsRouter.get(
  "/cards",
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
  ah(async (req: Request, res: Response) => {
    const body = z.object({ storyId: z.string().uuid() }).parse(req.body);
    const repo = await getRepo();
    const card = await repo.getCard(req.params.id!);
    if (!card) throw new HttpError(404, "card_not_found");
    await assertFamilyRole(req.userId!, card.familyId, ["owner"]);
    const story = await repo.getStory(body.storyId);
    if (!story || story.familyId !== card.familyId) throw new HttpError(400, "story_not_in_family");
    const updated = await repo.linkCard(card.id, story.id);
    res.json({ card: { id: updated!.id, storyId: updated!.storyId } });
  }),
);

/** Record that the physical tag was write-locked (the CoreNFC lock happens on-device). Owner. */
cardsRouter.post(
  "/cards/:id/lock",
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
  ah(async (req: Request, res: Response) => {
    const repo = await getRepo();
    const card = await repo.getCard(req.params.id!);
    if (!card) throw new HttpError(404, "card_not_found");
    await assertFamilyRole(req.userId!, card.familyId, ["owner"]);
    const updated = await repo.revokeCard(card.id);
    res.json({ card: { id: updated!.id, revoked: Boolean(updated!.revokedAt) } });
  }),
);
