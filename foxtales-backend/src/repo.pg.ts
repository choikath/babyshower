import { query } from "./db.js";
import type { Repo } from "./repo.js";
import type { Card, Family, Membership, Story, StoryStatus, User } from "./types.js";

// Row mappers (snake_case columns -> camelCase domain objects).
const toFamily = (r: any): Family => ({ id: r.id, name: r.name, childName: r.child_name, createdAt: r.created_at.toISOString?.() ?? r.created_at });
const toUser = (r: any): User => ({ id: r.id, appleSub: r.apple_sub, email: r.email, displayName: r.display_name, createdAt: r.created_at.toISOString?.() ?? r.created_at });
const toMembership = (r: any): Membership => ({ familyId: r.family_id, userId: r.user_id, role: r.role });
const toStory = (r: any): Story => ({
  id: r.id, familyId: r.family_id, fromName: r.from_name, fromUserId: r.from_user_id,
  title: r.title, author: r.author, note: r.note, durationSec: r.duration_sec === null ? null : Number(r.duration_sec),
  parts: r.parts, audioKey: r.audio_key, peaksKey: r.peaks_key, status: r.status as StoryStatus,
  inBedtime: r.in_bedtime, bedtimeOrder: r.bedtime_order, playCount: r.play_count,
  createdAt: r.created_at.toISOString?.() ?? r.created_at,
});
const toCard = (r: any): Card => ({
  id: r.id, familyId: r.family_id, storyId: r.story_id, token: r.token, locked: r.locked,
  lastTappedAt: r.last_tapped_at?.toISOString?.() ?? r.last_tapped_at, revokedAt: r.revoked_at?.toISOString?.() ?? r.revoked_at,
  createdAt: r.created_at.toISOString?.() ?? r.created_at,
});

export class PgRepo implements Repo {
  async createFamily(input: { name: string; childName?: string | null; id?: string }): Promise<Family> {
    const { rows } = await query(
      `insert into families (id, name, child_name) values (coalesce($1::uuid, gen_random_uuid()), $2, $3) returning *`,
      [input.id ?? null, input.name, input.childName ?? null],
    );
    return toFamily(rows[0]);
  }
  async getFamily(id: string): Promise<Family | null> {
    const { rows } = await query(`select * from families where id = $1`, [id]);
    return rows[0] ? toFamily(rows[0]) : null;
  }

  async upsertUser(input: { id: string; appleSub?: string | null; email?: string | null; displayName?: string | null }): Promise<User> {
    const { rows } = await query(
      `insert into users (id, apple_sub, email, display_name) values ($1,$2,$3,$4)
       on conflict (id) do update set
         apple_sub = coalesce(excluded.apple_sub, users.apple_sub),
         email = coalesce(excluded.email, users.email),
         display_name = coalesce(excluded.display_name, users.display_name)
       returning *`,
      [input.id, input.appleSub ?? null, input.email ?? null, input.displayName ?? null],
    );
    return toUser(rows[0]);
  }
  async getUser(id: string): Promise<User | null> {
    const { rows } = await query(`select * from users where id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async addMembership(input: Membership): Promise<Membership> {
    const { rows } = await query(
      `insert into memberships (family_id, user_id, role) values ($1,$2,$3)
       on conflict (family_id, user_id) do update set role = excluded.role returning *`,
      [input.familyId, input.userId, input.role],
    );
    return toMembership(rows[0]);
  }
  async getMembership(familyId: string, userId: string): Promise<Membership | null> {
    const { rows } = await query(`select * from memberships where family_id = $1 and user_id = $2`, [familyId, userId]);
    return rows[0] ? toMembership(rows[0]) : null;
  }

  async createStory(input: {
    familyId: string; fromName: string; fromUserId?: string | null; title: string;
    author?: string | null; note?: string | null; parts: number;
  }): Promise<Story> {
    const { rows } = await query(
      `insert into stories (family_id, from_name, from_user_id, title, author, note, parts, status)
       values ($1,$2,$3,$4,$5,$6,$7,'processing') returning *`,
      [input.familyId, input.fromName, input.fromUserId ?? null, input.title, input.author ?? null, input.note ?? null, input.parts],
    );
    return toStory(rows[0]);
  }
  async getStory(id: string): Promise<Story | null> {
    const { rows } = await query(`select * from stories where id = $1`, [id]);
    return rows[0] ? toStory(rows[0]) : null;
  }
  async markStoryReady(id: string, patch: { audioKey: string; peaksKey: string; durationSec: number; parts: number }): Promise<Story | null> {
    const { rows } = await query(
      `update stories set audio_key=$2, peaks_key=$3, duration_sec=$4, parts=$5, status='ready' where id=$1 returning *`,
      [id, patch.audioKey, patch.peaksKey, patch.durationSec, patch.parts],
    );
    return rows[0] ? toStory(rows[0]) : null;
  }
  async listStoriesForFamily(familyId: string): Promise<Story[]> {
    const { rows } = await query(`select * from stories where family_id = $1 order by created_at desc`, [familyId]);
    return rows.map(toStory);
  }
  async incrementPlayCount(id: string): Promise<void> {
    await query(`update stories set play_count = play_count + 1 where id = $1`, [id]);
  }

  async createCard(input: { familyId: string; token: string }): Promise<Card> {
    const { rows } = await query(
      `insert into cards (family_id, token) values ($1,$2) returning *`,
      [input.familyId, input.token],
    );
    return toCard(rows[0]);
  }
  async getCardByToken(token: string): Promise<Card | null> {
    const { rows } = await query(`select * from cards where token = $1`, [token]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async getCard(id: string): Promise<Card | null> {
    const { rows } = await query(`select * from cards where id = $1`, [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async linkCard(id: string, storyId: string | null): Promise<Card | null> {
    const { rows } = await query(`update cards set story_id = $2 where id = $1 returning *`, [id, storyId]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async setCardLocked(id: string, locked: boolean): Promise<Card | null> {
    const { rows } = await query(`update cards set locked = $2 where id = $1 returning *`, [id, locked]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async revokeCard(id: string): Promise<Card | null> {
    const { rows } = await query(`update cards set revoked_at = now() where id = $1 returning *`, [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }
  async touchCardLastTapped(id: string): Promise<void> {
    await query(`update cards set last_tapped_at = now() where id = $1`, [id]);
  }
  async listCardsForFamily(familyId: string): Promise<Card[]> {
    const { rows } = await query(`select * from cards where family_id = $1 order by created_at desc`, [familyId]);
    return rows.map(toCard);
  }
}
