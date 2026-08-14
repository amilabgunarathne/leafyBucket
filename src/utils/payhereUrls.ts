/**
 * PayHere checkout URLs for this app (production domain required — not localhost for notify).
 *
 * return_url  → browser redirect after customer finishes on PayHere
 * cancel_url  → browser redirect if customer cancels
 * notify_url  → server-to-server webhook (must be public HTTPS; implement separately)
 */

export const PAYHERE_PATHS = {
  return: '/payment/return',
  cancel: '/payment/cancel',
  /** Placeholder until a notify endpoint exists (Edge Function / API). */
  notify: '/api/payhere/notify',
} as const;

/** Absolute URLs for PayHere merchant / checkout form fields. */
export function getPayHereRedirectUrls(origin: string = typeof window !== 'undefined' ? window.location.origin : '') {
  const base = origin.replace(/\/$/, '');
  return {
    return_url: `${base}${PAYHERE_PATHS.return}`,
    cancel_url: `${base}${PAYHERE_PATHS.cancel}`,
    notify_url: `${base}${PAYHERE_PATHS.notify}`,
  };
}
