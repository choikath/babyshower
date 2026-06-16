import { env } from "./env.js";
import { getRepo } from "./repo.js";

/** Fixed ids so a smoke test / curl session knows what to target. Memory driver only. */
export const SEED_FAMILY_ID = "00000000-0000-0000-0000-0000000000f1";

export async function devSeed(): Promise<void> {
  if (process.env.DEV_SEED !== "true" || env.DB_DRIVER !== "memory") return;
  const repo = await getRepo();
  if (await repo.getFamily(SEED_FAMILY_ID)) return;
  await repo.createFamily({ id: SEED_FAMILY_ID, name: "The Test Family", childName: "Wren" });
  await repo.upsertUser({ id: env.DEV_USER_ID, displayName: "Dev Parent" });
  await repo.addMembership({ familyId: SEED_FAMILY_ID, userId: env.DEV_USER_ID, role: "owner" });
  console.log(`dev seed ready: family=${SEED_FAMILY_ID} owner=${env.DEV_USER_ID}`);
}
