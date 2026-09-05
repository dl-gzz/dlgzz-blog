/** Each distinct, one-use membership code adds its duration to remaining time. */
export function extendMembershipExpiry(
  currentExpiry: Date | null | undefined,
  durationDays: number | null,
  now: Date
) {
  if (currentExpiry === null || durationDays === null) return null;
  const start = Math.max(currentExpiry?.getTime() || 0, now.getTime());
  return new Date(start + durationDays * 86_400_000);
}
