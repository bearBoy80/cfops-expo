import { CloudflareApiError } from '../cloudflare/api';
import i18n from './index';

/**
 * Human-readable, translated message for a failed Cloudflare call.
 * Server-provided messages (`serverMessage`) pass through untranslated;
 * everything else maps from the error code to an `errors.*` resource.
 */
export function cloudflareErrorMessage(cause: unknown): string {
  if (cause instanceof CloudflareApiError) {
    if (cause.serverMessage) {
      return cause.serverMessage;
    }
    return i18n.t(`errors.${cause.code}`);
  }
  return i18n.t('common.genericError');
}
