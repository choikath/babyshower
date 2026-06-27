// Single source of truth for the "record your own way" funnel. Both repo drivers
// build their stage logic from this, so the Postgres aggregation and the in-memory
// fallback stay identical. Matching uses the event name plus an optional step and/or
// a single props key/value.
export interface FunnelStageDef {
  key: string;
  label: string;
  event: string;
  step?: string;
  prop?: { key: string; value: string };
}

export const RECORD_FUNNEL: FunnelStageDef[] = [
  { key: "opened", label: "Opened recorder", event: "app_opened" },
  { key: "started", label: "Started a recording", event: "flow_started" },
  { key: "intro", label: "Reached the intro", event: "step_viewed", step: "intro" },
  { key: "mode_free", label: 'Chose "record your own way"', event: "mode_selected", prop: { key: "mode", value: "free" } },
  { key: "recorded", label: "Recorded a story part", event: "record_started", prop: { key: "slot", value: "story" } },
  { key: "submitted", label: "Tapped finish & upload", event: "recording_submitted" },
  { key: "uploaded", label: "Upload succeeded", event: "upload_succeeded" },
  { key: "success", label: "Saw the success screen", event: "success_viewed" },
];

/** True if an event row matches a funnel stage definition. */
export function eventMatchesStage(
  e: { event: string; step?: string | null; props?: Record<string, unknown> | null },
  s: FunnelStageDef,
): boolean {
  if (e.event !== s.event) return false;
  if (s.step && (e.step ?? null) !== s.step) return false;
  if (s.prop) {
    const v = e.props ? e.props[s.prop.key] : undefined;
    if (String(v ?? "") !== s.prop.value) return false;
  }
  return true;
}
