import { randomUUID } from "node:crypto";
import type { Repo } from "./repo.js";
import type { Card, Family, Membership, Story, User } from "./types.js";

/**
 * No external services required. Useful for `DB_DRIVER=memory` local demos and
 * for tests. Row shapes match db/0001_init.sql so behavior matches Postgres.
 * State is per-process and not persisted.
 */
export class MemoryRepo implements Repo {
  private families = new Map<string, Family>();
  private users = new Map<string, User>();
  private memberships = new Map<string, Membership>(); // key: `${familyId}:${userId}`
  private stories = new Map<string, Story>();
  private cards = new Map<string, Card>();
  private cardsByToken = new Map<string, string>(); // token -> cardId

  private now() {
    return new Date().toISOString();
  }

  async createFamily(input: { name: string; childName?: string | null; id?: string }): Promise<Family> {
    const f: Family = { id: input.id ?? randomUUID(), name: input.name, childName: input.childName ?? null, createdAt: this.now() };
    this.families.set(f.id, f);
    return f;
  }
  async getFamily(id: string): Promise<Family | null> {
    return this.families.get(id) ?? null;
  }

  async upsertUser(input: { id: string; appleSub?: string | null; email?: string | null; displayName?: string | null }): Promise<User> {
    const existing = this.users.get(input.id);
    const u: User = {
      id: input.id,
      appleSub: input.appleSub ?? existing?.appleSub ?? null,
      email: input.email ?? existing?.email ?? null,
      displayName: input.displayName ?? existing?.displayName ?? null,
      createdAt: existing?.createdAt ?? this.now(),
    };
    this.users.set(u.id, u);
    return u;
  }
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async addMembership(input: Membership): Promise<Membership> {
    this.memberships.set(`${input.familyId}:${input.userId}`, input);
    return input;
  }
  async getMembership(familyId: string, userId: string): Promise<Membership | null> {
    return this.memberships.get(`${familyId}:${userId}`) ?? null;
  }

  async createStory(input: {
    familyId: string; fromName: string; fromUserId?: string | null; title: string;
    author?: string | null; note?: string | null; parts: number;
  }): Promise<Story> {
    const s: Story = {
      id: randomUUID(),
      familyId: input.familyId,
      fromName: input.fromName,
      fromUserId: input.fromUserId ?? null,
      title: input.title,
      author: input.author ?? null,
      note: input.note ?? null,
      durationSec: null,
      parts: input.parts,
      audioKey: null,
      peaksKey: null,
      status: "processing",
      inBedtime: false,
      bedtimeOrder: null,
      playCount: 0,
      createdAt: this.now(),
    };
    this.stories.set(s.id, s);
    return s;
  }
  async getStory(id: string): Promise<Story | null> {
    return this.stories.get(id) ?? null;
  }
  async markStoryReady(id: string, patch: { audioKey: string; peaksKey: string; durationSec: number; parts: number }): Promise<Story | null> {
    const s = this.stories.get(id);
    if (!s) return null;
    Object.assign(s, { ...patch, status: "ready" as const });
    return s;
  }
  async listStoriesForFamily(familyId: string): Promise<Story[]> {
    return [...this.stories.values()]
      .filter((s) => s.familyId === familyId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async incrementPlayCount(id: string): Promise<void> {
    const s = this.stories.get(id);
    if (s) s.playCount += 1;
  }

  async createCard(input: { familyId: string; token: string }): Promise<Card> {
    const c: Card = {
      id: randomUUID(),
      familyId: input.familyId,
      storyId: null,
      token: input.token,
      locked: false,
      lastTappedAt: null,
      revokedAt: null,
      createdAt: this.now(),
    };
    this.cards.set(c.id, c);
    this.cardsByToken.set(c.token, c.id);
    return c;
  }
  async getCardByToken(token: string): Promise<Card | null> {
    const id = this.cardsByToken.get(token);
    return id ? this.cards.get(id) ?? null : null;
  }
  async getCard(id: string): Promise<Card | null> {
    return this.cards.get(id) ?? null;
  }
  async linkCard(id: string, storyId: string | null): Promise<Card | null> {
    const c = this.cards.get(id);
    if (!c) return null;
    c.storyId = storyId;
    return c;
  }
  async setCardLocked(id: string, locked: boolean): Promise<Card | null> {
    const c = this.cards.get(id);
    if (!c) return null;
    c.locked = locked;
    return c;
  }
  async revokeCard(id: string): Promise<Card | null> {
    const c = this.cards.get(id);
    if (!c) return null;
    c.revokedAt = this.now();
    return c;
  }
  async touchCardLastTapped(id: string): Promise<void> {
    const c = this.cards.get(id);
    if (c) c.lastTappedAt = this.now();
  }
  async listCardsForFamily(familyId: string): Promise<Card[]> {
    return [...this.cards.values()]
      .filter((c) => c.familyId === familyId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
