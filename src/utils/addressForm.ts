/** Structured delivery address for profile edit; stored as multi-line `profiles.address` + `profiles.city`. */

export type StructuredAddress = {
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

export function emptyStructuredAddress(city = ''): StructuredAddress {
  return { line1: '', line2: '', city: city.trim(), postalCode: '' };
}

/** Build display / DB address text from structured fields (city kept separately on profiles.city). */
export function formatAddressLines(a: StructuredAddress): string {
  const parts: string[] = [];
  const l1 = a.line1.trim();
  const l2 = a.line2.trim();
  const postal = a.postalCode.trim();
  if (l1) parts.push(l1);
  if (l2) parts.push(l2);
  if (postal) parts.push(postal);
  return parts.join('\n');
}

/** Full address for display including city. */
export function formatAddressDisplay(a: StructuredAddress): string {
  const body = formatAddressLines(a);
  const city = a.city.trim();
  if (!body && !city) return '';
  if (!body) return city;
  if (!city) return body;
  return `${body}\n${city}`;
}

/**
 * Split a legacy freeform address into fields.
 * Prefills city from signup `profiles.city` when provided.
 */
export function parseAddressToStructured(
  address: string | null | undefined,
  cityFromProfile?: string | null
): StructuredAddress {
  const cityPrefill = (cityFromProfile || '').trim();
  const raw = (address || '').trim();
  if (!raw) return emptyStructuredAddress(cityPrefill);

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 1 && !raw.includes(',')) {
    // Single freeform blob (e.g. old textarea) → street; city from signup
    return {
      line1: lines[0],
      line2: '',
      city: cityPrefill,
      postalCode: '',
    };
  }

  // Multi-line or comma-separated: first = line1, optional second = line2, last short token may be postal
  let line1 = lines[0] || '';
  let line2 = '';
  let postalCode = '';
  let city = cityPrefill;

  if (lines.length >= 2) {
    const last = lines[lines.length - 1];
    const maybePostal = /^[0-9]{4,6}$/.test(last.replace(/\s/g, ''));
    if (maybePostal) {
      postalCode = last.replace(/\s/g, '');
      const mid = lines.slice(1, -1);
      if (mid.length) line2 = mid.join(', ');
    } else {
      line2 = lines.slice(1).join(', ');
    }
  }

  // Comma-only single line: "street, city, postal"
  if (lines.length === 1 && raw.includes(',')) {
    const bits = raw.split(',').map((b) => b.trim()).filter(Boolean);
    line1 = bits[0] || '';
    if (bits.length >= 2) {
      const last = bits[bits.length - 1];
      if (/^[0-9]{4,6}$/.test(last)) {
        postalCode = last;
        if (bits.length === 3) {
          city = cityPrefill || bits[1];
        } else if (bits.length > 3) {
          line2 = bits.slice(1, -2).join(', ');
          city = cityPrefill || bits[bits.length - 2];
        }
      } else if (!cityPrefill && bits.length >= 2) {
        city = bits[bits.length - 1];
        if (bits.length > 2) line2 = bits.slice(1, -1).join(', ');
      } else if (bits.length > 1) {
        line2 = bits.slice(1).join(', ');
      }
    }
  }

  return { line1, line2, city: city || cityPrefill, postalCode };
}
