// SiteTrack Pro — UPI deep-link builder (zero-spend payments).
// A UPI QR is just an image of this `upi://pay?...` string — no gateway, no fee.

export interface UpiArgs {
  vpa: string;          // payee VPA, e.g. rakesh@okhdfcbank
  name?: string;        // payee name
  amount?: number;      // INR
  note?: string;        // transaction note
}

export function buildUpiUri({ vpa, name, amount, note }: UpiArgs): string {
  const p = new URLSearchParams();
  p.set("pa", vpa.trim());
  if (name) p.set("pn", name.trim());
  if (amount && amount > 0) p.set("am", amount.toFixed(2));
  p.set("cu", "INR");
  if (note) p.set("tn", note.trim().slice(0, 60));
  return `upi://pay?${p.toString()}`;
}

/** Loose VPA sanity check (something@handle). */
export function isValidVpa(vpa: string): boolean {
  return /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim());
}
