import { getRepo } from "./repo.js";
import { isWellFormedToken } from "./token.js";
import type { ResolveResult } from "./types.js";

/**
 * Resolve a tapped capability token to a playable state (spec 1.1, Decision 2).
 * The token identifies a *card*; the card points at a story (or nothing yet).
 * `bump` records the tap (lastTappedAt) and should only be set on real plays.
 */
export async function resolveToken(token: string, opts: { bump: boolean }): Promise<ResolveResult> {
  if (!isWellFormedToken(token)) return { kind: "not_found" };

  const repo = await getRepo();
  const card = await repo.getCardByToken(token);
  if (!card) return { kind: "not_found" };
  if (card.revokedAt) return { kind: "revoked" };

  if (opts.bump) await repo.touchCardLastTapped(card.id);

  if (!card.storyId) return { kind: "unlinked", card };

  const story = await repo.getStory(card.storyId);
  if (!story) return { kind: "not_found" };
  if (story.status !== "ready" || !story.audioKey) return { kind: "processing", card, story };

  return { kind: "ready", card, story };
}
