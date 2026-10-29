/** Maximum parcel reports accepted for one mailbox per hour, enforced by the backend. */
export const DELIVERY_LIMIT_PER_HOUR = 5;

/** Printed mailbox codes ignore letter case, spaces, and separators. */
export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
