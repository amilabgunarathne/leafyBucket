/** Strip to digits only for phone validation */
const phoneDigitsOnly = (value: string): string => value.replace(/\D/g, '');

/** Phone number: exactly 10 digits */
export const PHONE_DIGITS = 10;

/**
 * Validates a phone number: digits only, exactly PHONE_DIGITS.
 * Returns an error message or null if valid.
 */
export function validatePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return 'Phone number is required';
  const digits = phoneDigitsOnly(trimmed);
  if (digits.length !== PHONE_DIGITS) return `Phone number must be exactly ${PHONE_DIGITS} digits`;
  return null;
}

/** Password minimum length (Supabase auth default) */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Validates password length. Returns an error message or null if valid.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  return null;
}

/** Restrict string to digits only, max length (for phone input). */
export function restrictToDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}
