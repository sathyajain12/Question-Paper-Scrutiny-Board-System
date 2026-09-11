/**
 * What the sender's ticks show, derived from the conversation's watermarks.
 *
 * Stated once, here, because the HoD widget and the admin desk both render it
 * and must never disagree about what a tick means.
 *
 *   ✓   sent      — stored, but the recipient has not been connected since
 *   ✓✓  delivered — the recipient has been online since it was sent
 *   ✓✓  read      — the recipient has opened the conversation since
 *
 * A receipt describes the *recipient*, so it is only meaningful on your own
 * messages; callers render nothing for the other side's.
 *
 * ISO-8601 strings compare lexicographically in the same order as the instants
 * they name, so these are plain string comparisons rather than Date parsing.
 */
import type { SupportConversation, SupportMessage, SupportReceipt } from '../types';

export function receiptFor(
  message: SupportMessage,
  conversation: SupportConversation | undefined,
): SupportReceipt {
  if (!conversation) return 'sent';

  // The receipt belongs to whoever is on the other end of this message.
  const sentByHod = message.authorRole === 'hod';
  const deliveredAt = sentByHod
    ? conversation.adminDeliveredAt
    : conversation.hodDeliveredAt;
  const readAt = sentByHod ? conversation.adminReadAt : conversation.hodReadAt;

  if (readAt && readAt >= message.sentAt) return 'read';
  if (deliveredAt && deliveredAt >= message.sentAt) return 'delivered';
  return 'sent';
}
