/** Strip to digits only for phone validation */
const phoneDigitsOnly = (value: string): string => value.replace(/\D/g, '');

/** Min/max digit length for phone numbers (E.164 style, e.g. 10–15 digits) */
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

/**
 * Validates a phone number: digits only, length between PHONE_MIN_DIGITS and PHONE_MAX_DIGITS.
 * Returns an error message or null if valid.
 */
export function validatePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return 'Phone number is required';
  const digits = phoneDigitsOnly(trimmed);
  if (digits.length < PHONE_MIN_DIGITS) return `Phone number must have at least ${PHONE_MIN_DIGITS} digits`;
  if (digits.length > PHONE_MAX_DIGITS) return `Phone number must have at most ${PHONE_MAX_DIGITS} digits`;
  return null;
}
