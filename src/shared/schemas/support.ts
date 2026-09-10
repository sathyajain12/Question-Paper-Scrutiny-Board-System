/**
 * Client → server frames for the support socket.
 *
 * A WebSocket has no route table and no `zValidator` middleware, so this is
 * the only thing standing between the socket and the Durable Object's state.
 * Every inbound frame is parsed through it before anything is written — the
 * same rule the HTTP routes get for free from `zValidator('json', …)`.
 */
import { z } from 'zod';
import { MAX_SUPPORT_MESSAGE_LENGTH } from '../constants/support';

const conversationId = z.string().trim().min(1).max(320);

export const supportClientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send'),
    /**
     * Administrators must name the thread they are replying to. A HoD may
     * not: the server uses their own email, so one HoD cannot post into
     * another's conversation by editing this field.
     */
    conversationId: conversationId.optional(),
    text: z
      .string()
      .trim()
      .min(1, 'Type a message first.')
      .max(
        MAX_SUPPORT_MESSAGE_LENGTH,
        `Keep it under ${MAX_SUPPORT_MESSAGE_LENGTH} characters.`,
      ),
  }),
  /**
   * "I am typing." Ephemeral — never stored, never acknowledged. The sender
   * throttles these; the receiver hides the indicator on a timeout, so a
   * dropped socket can't leave someone typing forever and no "stopped"
   * frame is needed.
   */
  z.object({ type: z.literal('typing'), conversationId: conversationId.optional() }),

  /** Clears the unread counter for whichever side sent it. */
  z.object({ type: z.literal('markRead'), conversationId }),
  /** Admin-only: the question has been answered. A new HoD message reopens it. */
  z.object({ type: z.literal('resolve'), conversationId }),
  /** Admin-only: pull a thread's messages when opening it in the inbox. */
  z.object({ type: z.literal('history'), conversationId }),
]);

export type SupportClientFrame = z.infer<typeof supportClientFrameSchema>;
