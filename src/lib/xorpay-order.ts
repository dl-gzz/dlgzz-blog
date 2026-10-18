/** Parse CNY into integer cents without rounding or trusting floating point. */
export function parseXorPayAmount(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2_147_483_647
    ? cents
    : null;
}
