import { PlatformMember, User } from "./models";

/**
 * The HQ's first account (T-066): a user with this e-mail and an active platform admin role.
 * Safe to run twice; an existing user keeps its id, sessions and 2FA. The first HQ sign-in then
 * starts with the TOTP setup, since HQ lets no one in without it.
 */
export async function ensureHqAdmin(
  rawEmail: string,
): Promise<{ userId: string; created: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(`not an e-mail address: ${rawEmail}`);

  const existing = await User.findOne({ email }).select("_id").lean();
  let user = existing;
  if (!user) {
    // The magic link and Google sign-in find this user by e-mail.
    const created = new User({ email, name: email });
    // Better Auth's own field, outside the (strict: false) schema.
    created.set("emailVerified", true);
    user = await created.save();
  }
  await PlatformMember.updateOne(
    { userId: user._id },
    { $set: { role: "admin", isActive: true } },
    { upsert: true },
  );
  return { userId: String(user._id), created: !existing };
}
