/**
 * Client → server frames for the support socket.
 *
 * A WebSocket has no route table and no `zValidator` middleware, so this is
 * the only thing standing between the socket and the Durable Object's state.
 * Every inbound frame is parsed through it before anything is written — the
 * same rule the HTTP routes get for free from `zValidator('json', …)`.
 */
import { z } from 'zod';
import {
  MAX_IMAGE_DATA_URL_LENGTH,
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_CATEGORIES,
} from '../constants/support';

const conversationId = z.string().trim().min(1).max(320);

/**
 * An already-compressed image, as a data URL. The browser downscales and
 * re-encodes before sending; this is the backstop that keeps an oversized
 * one out of storage regardless of what the client did.
 */
const imagePayload = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image.')
    .max(MAX_IMAGE_DATA_URL_LENGTH, 'That image is too large to send.'),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});

export const supportClientFrameSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('send'),
      /**
       * The thread to post into. An administrator must always name one. A
       * HoD may omit it to **open a new thread** — which is how a second,
       * unrelated question gets its own transcript instead of interleaving
       * with the first. When a HoD does name one, the server checks they own
       * it; it never takes the sender's identity from here.
       */
      conversationId: conversationId.optional(),
      // An image may travel on its own, so the floor is 0 here and the
      // "say something" rule moves to the refine below.
      text: z
        .string()
        .trim()
        .max(
          MAX_SUPPORT_MESSAGE_LENGTH,
          `Keep it under ${MAX_SUPPORT_MESSAGE_LENGTH} characters.`,
        ),
      image: imagePayload.optional(),
    })
    .refine((f) => f.text.length > 0 || f.image !== undefined, {
      message: 'Type a message first.',
      path: ['text'],
    }),

  /** Fetch one image's bytes — transcripts carry ids, never the pictures. */
  z.object({ type: z.literal('image'), imageId: z.string().trim().min(1).max(120) }),
  /**
   * "I am typing." Ephemeral — never stored, never acknowledged. The sender
   * throttles these; the receiver hides the indicator on a timeout, so a
   * dropped socket can't leave someone typing forever and no "stopped"
   * frame is needed.
   */
  z.object({ type: z.literal('typing'), conversationId: conversationId.optional() }),

  /** Clears the unread counter for whichever side sent it. */
  z.object({ type: z.literal('markRead'), conversationId }),
  /**
   * Admin-only: the question has been answered. A new HoD message reopens it.
   * The category is what the thread turned out to be about — asked for here,
   * at the end, rather than of the HoD at the start.
   */
  z.object({
    type: z.literal('resolve'),
    conversationId,
    category: z.enum(SUPPORT_CATEGORIES),
  }),
  /** Admin-only: pull a thread's messages when opening it in the inbox. */
  z.object({ type: z.literal('history'), conversationId }),

  /**
   * HoD-only: name the board this thread is about, or `null` to clear it.
   * The server checks the id against the boards it resolved for this session,
   * so a HoD cannot attach someone else's programme.
   */
  z.object({
    type: z.literal('setBoard'),
    conversationId,
    boardId: z.string().trim().min(1).max(200).nullable(),
  }),

  /** Admin-only, irreversible: remove a thread and everything in it. */
  z.object({ type: z.literal('delete'), conversationId }),
]);

export type SupportClientFrame = z.infer<typeof supportClientFrameSchema>;
