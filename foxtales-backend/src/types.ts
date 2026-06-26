// Domain types — mirror the spec's data model (2.3).

export type Role = "owner" | "member";
export type StoryStatus = "processing" | "ready";

export interface Family {
  id: string;
  name: string;
  childName: string | null;
  createdAt: string;
}

export interface User {
  id: string; // matches Supabase auth user id (auth.users.id)
  appleSub: string | null;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface Membership {
  familyId: string;
  userId: string;
  role: Role;
}

export interface Story {
  id: string;
  familyId: string;
  fromName: string;
  fromUserId: string | null;
  title: string;
  author: string | null;
  note: string | null;
  durationSec: number | null;
  parts: number;
  audioKey: string | null;
  peaksKey: string | null;
  status: StoryStatus;
  inBedtime: boolean;
  bedtimeOrder: number | null;
  playCount: number;
  noteCtaClicks: number; // times the player's "record a voice note" CTA was tapped
  createdAt: string;
}

// A voice memo a listener recorded and sent back to the reader (spec: recording
// updates). Created anonymously from the streamlined recorder at /note/:token,
// surfaced in the family's admin "Voice Memo Inbox".
export type VoiceNoteStatus = "processing" | "ready";

export interface VoiceNote {
  id: string;
  familyId: string;
  originCardId: string | null;
  originStoryId: string | null;
  originToken: string | null;
  readerName: string | null; // receiver — the story's reader
  senderName: string | null; // who left the memo (optional)
  message: string | null; // optional typed note
  audioKey: string | null;
  durationSec: number | null;
  ext: string | null;
  status: VoiceNoteStatus;
  playedAt: string | null;
  createdAt: string;
}

export interface Card {
  id: string;
  familyId: string;
  storyId: string | null; // Option C: binding lives here, not on the tag
  token: string;
  locked: boolean;
  lastTappedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// Discriminated result of resolving a tapped token (used by both /p and /play).
export type ResolveResult =
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "unlinked"; card: Card }
  | { kind: "processing"; card: Card; story: Story }
  | { kind: "ready"; card: Card; story: Story };
