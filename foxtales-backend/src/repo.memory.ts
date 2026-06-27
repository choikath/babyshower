import { randomUUID } from "node:crypto";
import type { Repo } from "./repo.js";
import type { Card, Family, Membership, Story, User, VoiceNote, EventInput, FunnelResult } from "./types.js";
import { RECORD_FUNNEL, eventMatchesStage } from "./analytics.js";

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
  private voiceNotes = new Map<string, VoiceNote>();

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
      noteCtaClicks: 0,
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
  async incrementNoteCtaClicks(id: string): Promise<void> {
    const s = this.stories.get(id);
    if (s) s.noteCtaClicks += 1;
  }

  async createVoiceNote(input: {
    id?: string; familyId: string; originCardId?: string | null; originStoryId?: string | null; originToken?: string | null;
    readerName?: string | null; senderName?: string | null; message?: string | null;
    audioKey: string; ext: string; durationSec?: number | null;
  }): Promise<VoiceNote> {
    const v: VoiceNote = {
      id: input.id ?? randomUUID(),
      familyId: input.familyId,
      originCardId: input.originCardId ?? null,
      originStoryId: input.originStoryId ?? null,
      originToken: input.originToken ?? null,
      readerName: input.readerName ?? null,
      senderName: input.senderName ?? null,
      message: input.message ?? null,
      audioKey: input.audioKey,
      durationSec: input.durationSec ?? null,
      ext: input.ext,
      status: "processing",
      playedAt: null,
      createdAt: this.now(),
    };
    this.voiceNotes.set(v.id, v);
    return v;
  }
  async getVoiceNote(id: string): Promise<VoiceNote | null> {
    return this.voiceNotes.get(id) ?? null;
  }
  async markVoiceNoteReady(id: string, patch: { durationSec: number | null }): Promise<VoiceNote | null> {
    const v = this.voiceNotes.get(id);
    if (!v) return null;
    v.status = "ready";
    if (patch.durationSec != null) v.durationSec = patch.durationSec;
    return v;
  }
  async listVoiceNotesForFamily(familyId: string): Promise<VoiceNote[]> {
    return [...this.voiceNotes.values()]
      .filter((v) => v.familyId === familyId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async touchVoiceNotePlayed(id: string): Promise<void> {
    const v = this.voiceNotes.get(id);
    if (v && !v.playedAt) v.playedAt = this.now();
  }

  private events: Array<EventInput & { ts: number }> = [];
  async insertEvents(events: EventInput[]): Promise<void> {
    const now = Date.now();
    for (const e of events) this.events.push({ ...e, ts: now });
  }
  async getRecordFunnel(sinceHours: number): Promise<FunnelResult> {
    const cutoff = Date.now() - sinceHours * 3600_000;
    const rows = this.events.filter((e) => (e.flow ?? null) === "record_own" && e.sessionId && e.ts > cutoff);
    // group by session
    const bySession = new Map<string, { device: string | null; flags: boolean[] }>();
    for (const e of rows) {
      const sid = e.sessionId!;
      let g = bySession.get(sid);
      if (!g) { g = { device: e.deviceId ?? null, flags: RECORD_FUNNEL.map(() => false) }; bySession.set(sid, g); }
      if (e.deviceId) g.device = e.deviceId;
      RECORD_FUNNEL.forEach((s, i) => { if (eventMatchesStage(e, s)) g!.flags[i] = true; });
    }
    const sessions = [...bySession.values()];
    const stages = RECORD_FUNNEL.map((s, i) => {
      const hit = sessions.filter((g) => g.flags[i]);
      const devices = new Set(hit.map((g) => g.device).filter(Boolean));
      return { key: s.key, label: s.label, sessions: hit.length, devices: devices.size };
    });
    const totalDevices = new Set(sessions.map((g) => g.device).filter(Boolean)).size;
    return { sinceHours, stages, totalSessions: sessions.length, totalDevices };
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
