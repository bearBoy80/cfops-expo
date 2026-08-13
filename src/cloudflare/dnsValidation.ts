/**
 * Client-side validation for DNS record drafts, mirroring the checks
 * Cloudflare performs server-side so users get instant, translated feedback.
 */

export interface DnsRecordDraft {
  type: string;
  name: string;
  content: string;
  /** Raw text field value; only meaningful for MX records. */
  priority?: string;
}

/** Field -> i18n message key. Empty object means the draft is valid. */
export interface DnsFieldErrors {
  name?: string;
  content?: string;
  priority?: string;
}

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

// Covers full and `::`-compressed forms; IPv4-mapped suffixes are not needed
// for AAAA content.
const IPV6 =
  /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(:[0-9a-f]{1,4}){1,6}|:((:[0-9a-f]{1,4}){1,7}|:))$/i;

// DNS labels: letters, digits, underscores and inner hyphens; optional
// leading wildcard and trailing root dot.
const HOSTNAME =
  /^(\*\.)?([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

const HOSTNAME_CONTENT_TYPES = new Set(['CNAME', 'NS', 'MX']);

export function validateDnsRecord(draft: DnsRecordDraft): DnsFieldErrors {
  const errors: DnsFieldErrors = {};
  const name = draft.name.trim();
  const content = draft.content.trim();

  if (!name) {
    errors.name = 'dns.errNameRequired';
  } else if (name !== '@' && !HOSTNAME.test(name)) {
    errors.name = 'dns.errNameInvalid';
  }

  if (!content) {
    errors.content = 'dns.errContentRequired';
  } else if (draft.type === 'A' && !IPV4.test(content)) {
    errors.content = 'dns.errIpv4';
  } else if (draft.type === 'AAAA' && !IPV6.test(content)) {
    errors.content = 'dns.errIpv6';
  } else if (
    HOSTNAME_CONTENT_TYPES.has(draft.type) &&
    (IPV4.test(content) || !HOSTNAME.test(content))
  ) {
    errors.content = 'dns.errHostname';
  }

  if (draft.type === 'MX') {
    const priority = Number((draft.priority ?? '').trim());
    if (
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 65535 ||
      (draft.priority ?? '').trim() === ''
    ) {
      errors.priority = 'dns.errPriority';
    }
  }

  return errors;
}
