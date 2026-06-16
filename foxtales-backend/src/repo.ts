import type { Card, Family, Membership, Story, StoryStatus, User } from "./types.js";
import { env } from "./env.js";

export interface Repo {
  // families
  createFamily(input: { name: string; childName?: string | null; id?: string }): Promise<Family>;
  getFamily(id: string): Promise<Family | null>;

  // users
  upsertUser(input: { id: string; appleSub?: string | null; email?: string | null; displayName?: string | null }): Promise<User>;
  getUser(id: string): Promise<User | null>;

  // memberships
  addMembership(input: Membership): Promise<Membership>;
  getMembership(familyId: string, userId: string): Promise<Membership | null>;

  // stories
  createStory(input: {
    familyId: string;
    fromName: string;
    fromUserId?: string | null;
    title: string;
    author?: string | null;
    note?: string | null;
    parts: number;
  }): Promise<Story>;
  getStory(id: string): Promise<Story | null>;
  markStoryReady(id: string, patch: { audioKey: string; peaksKey: string; durationSec: number; parts: number }): Promise<Story | null>;
  listStoriesForFamily(familyId: string): Promise<Story[]>;
  incrementPlayCount(id: string): Promise<void>;

  // cards
  createCard(input: { familyId: string; token: string }): Promise<Card>;
  getCardByToken(token: string): Promise<Card | null>;
  getCard(id: string): Promise<Card | null>;
  linkCard(id: string, storyId: string | null): Promise<Card | null>;
  setCardLocked(id: string, locked: boolean): Promise<Card | null>;
  revokeCard(id: string): Promise<Card | null>;
  touchCardLastTapped(id: string): Promise<void>;
  listCardsForFamily(familyId: string): Promise<Card[]>;
}

let repoSingleton: Repo | null = null;

export async function getRepo(): Promise<Repo> {
  if (repoSingleton) return repoSingleton;
  if (env.DB_DRIVER === "postgres") {
    const { PgRepo } = await import("./repo.pg.js");
    repoSingleton = new PgRepo();
  } else {
    const { MemoryRepo } = await import("./repo.memory.js");
    repoSingleton = new MemoryRepo();
  }
  return repoSingleton;
}

export type { Card, Family, Membership, Story, StoryStatus, User };
