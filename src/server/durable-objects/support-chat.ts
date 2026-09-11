/**
 * SupportChat — one Durable Object for the entire support desk.
 *
 * Unlike BoardLock (one instance per board), this is a deliberate singleton,
 * addressed by `idFromName(SUPPORT_DESK_ID)`. That is the whole point: every
 * HoD and every administrator holds a socket to the *same* object, so
 * "is anyone online?" is answered by counting live connections rather than by
 * polling a heartbeat table and guessing. A DO is the only place in this
 * stack where that fact exists in one location.
 *
 * Sockets use the WebSocket Hibernation API (`acceptWebSocket`), so an idle
 * desk — which is most of the time — costs no duration billing while keeping
 * connections open. Because a hibernated object loses its in-memory state,
 * each socket carries its own identity via `serializeAttachment`, and all
 * conversation state lives in storage rather than in class fields.
 *
 * Storage layout:
 *   conv:<conversationId>            → SupportConversation
 *   msg:<conversationId>:<seq(12)>   → SupportMessage   (seq zero-padded so
 *                                      `list()` returns chronological order)
 *   seq:<conversationId>             → number
 */
import { supportClientFrameSchema } from '@shared/schemas/support';
import {
  MAX_SUBJECT_LENGTH,
  NOTIFY_OFFICE_AFTER_MS,
  NOTIFY_OFFICE_COOLDOWN_MS,
  SUPPORT_DESK_ID,
  SUPPORT_REFERENCE_PREFIX,
  SUPPORT_REFERENCE_START,
} from '@shared/constants/support';
import type {
  Role,
  SupportBoardOption,
  SupportCategory,
  SupportConversation,
  SupportImage,
  SupportMessage,
  SupportPresence,
  SupportServerFrame,
} from '@shared/types';
import type { Env } from '../env';
import { sendEmail } from '../notifications/mailer';

/**
 * Identity is passed from the Worker, which has already run `requireSession`.
 * The DO is not routable from the internet — only our own Worker can reach
 * it — so this header cannot be spoofed by a browser.
 */
export const SUPPORT_USER_HEADER = 'X-QPSB-Support-User';

export interface SupportSocketUser {
  email: string;
  name: string;
  role: Role;
  departments: string[];
  /**
   * The boards this HoD may attach to their thread, resolved from the
   * repository at connect time. The object has no repository of its own, so
   * this list is the only authority it has for "is that board yours?" —
   * exactly like the session being the only authority for who you are.
   */
  boards?: SupportBoardOption[];
}

/**
 * What is actually stored on the socket. `connectedAt` gives a socket that
 * dies before its very first ping a deadline of its own — without it, a
 * never-pinged socket would have no timestamp to age out against.
 */
type SocketAttachment = SupportSocketUser & {
  connectedAt: number;
  /** Updated on every ping; absent until the first one arrives. */
  lastSeen?: number;
};

/**
 * Liveness.
 *
 * A socket that dies without a close handshake — a closed laptop, a crashed
 * tab, a dropped connection — stays registered with the runtime, and would
 * otherwise keep its owner listed as "online" indefinitely. For an admin that
 * is the worst possible failure: the HoD is told someone is available, waits,
 * and never sees the phone number that is the entire point of the fallback.
 *
 * So the client pings and we record when it last did, in the socket's own
 * attachment. A socket that has not pinged within the timeout is treated as
 * gone, and an alarm sweeps periodically so presence corrects itself even when
 * no one connects or disconnects.
 *
 * Why not `setWebSocketAutoResponse`, which would let the runtime answer pings
 * without waking this object at all: its timestamp turned out to advance on
 * *any* socket activity under local emulation, including our own outbound
 * presence broadcasts. That makes it self-sustaining — the sweep writes to a
 * dead socket, which marks the dead socket alive, forever. Recording the ping
 * ourselves costs one wake per client per interval and behaves identically in
 * dev and production, which is worth more here than the saved wakes.
 */
const PING = 'ping';
const PONG = 'pong';
const LIVENESS_TIMEOUT_MS = 90_000;
const LIVENESS_SWEEP_MS = 30_000;

/** Trim a thread once it passes this, so one long-running chat can't grow forever. */
const MAX_STORED_MESSAGES = 500;
/** How much history a client receives when it connects or opens a thread. */
const HISTORY_LIMIT = 200;
const PREVIEW_LENGTH = 120;

const seqKey = (id: string) => `seq:${id}`;
const convKey = (id: string) => `conv:${id}`;
const msgPrefix = (id: string) => `msg:${id}:`;
const msgKey = (id: string, seq: number) =>
  `${msgPrefix(id)}${String(seq).padStart(12, '0')}`;
/** Image bytes live apart from the message so history stays small. */
const imgKey = (imageId: string) => `img:${imageId}`;

export class SupportChat implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env['Bindings'],
  ) {}

  // ── Connection lifecycle ───────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const raw = request.headers.get(SUPPORT_USER_HEADER);
    if (!raw) return new Response('Missing support identity', { status: 401 });

    let user: SupportSocketUser;
    try {
      user = JSON.parse(raw) as SupportSocketUser;
    } catch {
      return new Response('Malformed support identity', { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Tags are the only way to find a socket again after hibernation, so
    // everything we need to route by has to be one: role for broadcasts,
    // email for delivering into a specific HoD's thread.
    this.state.acceptWebSocket(server, [
      `role:${user.role}`,
      `user:${user.email.toLowerCase()}`,
    ]);
    const attachment: SocketAttachment = { ...user, connectedAt: Date.now() };
    server.serializeAttachment(attachment);

    await this.sendInit(server, user);
    // A new admin connecting flips "no one is online" for every waiting HoD.
    if (user.role === 'admin') this.broadcastPresence();
    await this.scheduleNextAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  /**
   * Liveness sweep. Closes sockets that have stopped answering pings and
   * republishes presence, so "no one is online" becomes true again within a
   * sweep of the last admin actually going away — not only when someone else
   * happens to connect.
   */
  async alarm(): Promise<void> {
    for (const socket of this.state.getWebSockets()) {
      if (this.isAlive(socket)) continue;
      try {
        socket.close(1001, 'No ping received');
      } catch {
        // Already gone; presence() ignores it either way.
      }
    }

    this.broadcastPresence();
    await this.notifyUnanswered();
    await this.scheduleNextAlarm();
  }

  /**
   * One alarm serves two jobs, so it is scheduled for whichever comes first.
   *
   * The liveness sweep only matters while someone is connected; the office
   * notification matters *especially* when nobody is — so an empty desk with
   * a waiting thread still keeps an alarm pending, which the old
   * sockets-only rule would have skipped entirely.
   */
  private async scheduleNextAlarm(): Promise<void> {
    const candidates: number[] = [];

    if (this.state.getWebSockets().length > 0) {
      candidates.push(Date.now() + LIVENESS_SWEEP_MS);
    }

    for (const conversation of await this.allConversations()) {
      if (conversation.notifyDueAt && conversation.unreadForAdmin > 0) {
        candidates.push(Date.parse(conversation.notifyDueAt));
      }
    }

    if (candidates.length === 0) return;
    const next = Math.min(...candidates);

    // Only move the alarm earlier; a later one would delay work already due.
    const existing = await this.state.storage.getAlarm();
    if (existing !== null && existing <= next) return;
    await this.state.storage.setAlarm(next);
  }

  /**
   * Email the office about threads that have gone unanswered with nobody on
   * the desk. Re-checked at fire time rather than trusted from send time: an
   * admin who signed in during the delay makes the email unnecessary.
   */
  private async notifyUnanswered(): Promise<void> {
    const now = Date.now();
    const adminHere = this.presence().adminsOnline > 0;

    for (const conversation of await this.allConversations()) {
      if (!conversation.notifyDueAt) continue;
      if (Date.parse(conversation.notifyDueAt) > now) continue;

      // Someone is here, or has already read it — nothing to chase.
      if (adminHere || conversation.unreadForAdmin === 0) {
        await this.state.storage.put(convKey(conversation.conversationId), {
          ...conversation,
          notifyDueAt: null,
        });
        continue;
      }

      const withinCooldown =
        conversation.notifiedAt &&
        now - Date.parse(conversation.notifiedAt) < NOTIFY_OFFICE_COOLDOWN_MS;

      if (!withinCooldown) {
        await this.emailOffice(conversation);
      }

      await this.state.storage.put(convKey(conversation.conversationId), {
        ...conversation,
        notifyDueAt: null,
        notifiedAt: withinCooldown ? conversation.notifiedAt : new Date(now).toISOString(),
      });
    }
  }

  private async emailOffice(conversation: SupportConversation): Promise<void> {
    const waiting = conversation.unreadForAdmin;
    const about = conversation.boardProgramme
      ? `\nProgramme: ${conversation.boardProgramme}`
      : '';

    await sendEmail(this.env, {
      to: this.env.SUPPORT_NOTIFY_EMAIL,
      subject: `QPSB Portal — ${conversation.hodName} is waiting for a reply`,
      text:
        `${conversation.hodName} (${conversation.hodEmail}) sent ${waiting} ` +
        `${waiting === 1 ? 'message' : 'messages'} to the support desk and no one ` +
        `was signed in to answer.` +
        `\n\nDepartment: ${conversation.departments.join(', ') || '—'}${about}` +
        `\nLatest: ${conversation.lastMessagePreview || '(no text)'}` +
        `\n\nOpen the Support Desk in the QPSB Portal to reply.`,
    });
  }

  /**
   * `lastSeen` is absent until the first ping arrives, so a brand-new socket
   * is judged against when it connected instead — otherwise a client that
   * died before its first heartbeat would have no deadline at all.
   */
  private isAlive(ws: WebSocket): boolean {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const lastSeen = attachment?.lastSeen ?? attachment?.connectedAt ?? 0;
    return Date.now() - lastSeen < LIVENESS_TIMEOUT_MS;
  }

  // ── Inbound frames ─────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const user = ws.deserializeAttachment() as SocketAttachment | null;
    if (!user) {
      ws.close(1011, 'Unknown session');
      return;
    }

    if (typeof raw !== 'string') {
      this.send(ws, { type: 'error', message: 'Binary frames are not supported.' });
      return;
    }

    // The heartbeat. Recording it here — rather than letting the runtime
    // auto-respond — is what makes `isAlive` mean "the client is still there".
    if (raw === PING) {
      ws.serializeAttachment({ ...user, lastSeen: Date.now() });
      try {
        ws.send(PONG);
      } catch {
        // Socket already gone; the sweep will clear it.
      }
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.send(ws, { type: 'error', message: 'Malformed message.' });
      return;
    }

    const parsed = supportClientFrameSchema.safeParse(json);
    if (!parsed.success) {
      this.send(ws, {
        type: 'error',
        message: parsed.error.issues[0]?.message ?? 'Message rejected.',
      });
      return;
    }

    const frame = parsed.data;

    switch (frame.type) {
      case 'send':
        await this.handleSend(ws, user, frame.conversationId, frame.text, frame.image);
        return;
      case 'image':
        await this.handleImage(ws, frame.imageId);
        return;
      case 'typing':
        this.handleTyping(user, frame.conversationId);
        return;
      case 'markRead':
        await this.handleMarkRead(user, frame.conversationId);
        return;
      case 'resolve':
        await this.handleResolve(ws, user, frame.conversationId, frame.category);
        return;
      case 'history':
        await this.handleHistory(ws, user, frame.conversationId);
        return;
      case 'setBoard':
        await this.handleSetBoard(ws, user, frame.conversationId, frame.boardId);
        return;
      case 'delete':
        await this.handleDelete(ws, user, frame.conversationId);
        return;
    }
  }

  /**
   * Attach (or clear) the board a thread is about.
   *
   * HoD-only, and validated against the boards resolved for this session —
   * the object cannot ask the repository itself, so the session's list is its
   * authority. Same rule as everywhere else: never trust the payload.
   */
  private async handleSetBoard(
    ws: WebSocket,
    user: SupportSocketUser,
    conversationId: string,
    boardId: string | null,
  ): Promise<void> {
    if (user.role !== 'hod') {
      this.send(ws, {
        type: 'error',
        message: 'Only the Head of Department can set the board for a thread.',
      });
      return;
    }

    const match = boardId
      ? user.boards?.find((b) => b.boardId === boardId)
      : undefined;

    if (boardId && !match) {
      this.send(ws, { type: 'error', message: 'That is not one of your programmes.' });
      return;
    }

    // Nothing to attach to until the thread exists; the picker is hidden
    // client-side until then, so this is just the backstop.
    const conversation = await this.ownedConversation(user, conversationId);
    if (!conversation) return;

    const updated: SupportConversation = {
      ...conversation,
      boardId: match?.boardId ?? null,
      boardProgramme: match?.programme ?? null,
    };
    await this.state.storage.put(convKey(conversation.conversationId), updated);

    const frame: SupportServerFrame = { type: 'conversation', conversation: updated };
    this.toUser(updated.hodEmail, frame);
    this.toAdmins(frame);
  }

  /** Admin-only and irreversible: the thread, its messages and its images. */
  private async handleDelete(
    ws: WebSocket,
    user: SupportSocketUser,
    rawId: string,
  ): Promise<void> {
    if (user.role !== 'admin') {
      this.send(ws, {
        type: 'error',
        message: 'Only an administrator can delete a conversation.',
      });
      return;
    }

    const conversationId = rawId.toLowerCase();
    const conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );
    if (!conversation) return;

    const stored = await this.state.storage.list<SupportMessage>({
      prefix: msgPrefix(conversationId),
    });

    await this.state.storage.delete([
      convKey(conversationId),
      seqKey(conversationId),
      ...stored.keys(),
      // Orphaned bytes would otherwise outlive the thread entirely.
      ...[...stored.values()]
        .map((m) => m.image?.id)
        .filter((id): id is string => Boolean(id))
        .map(imgKey),
    ]);

    const frame: SupportServerFrame = { type: 'deleted', conversationId };
    this.toUser(conversation.hodEmail, frame);
    this.toAdmins(frame);
  }

  // ── Handlers ───────────────────────────────────────────────────────

  /**
   * Resolve a thread the caller is entitled to touch.
   *
   * Now that threads have their own ids, "is this yours?" is a real question
   * rather than one the key answered for us — so every handler that takes a
   * conversationId goes through here. An administrator may open any thread; a
   * HoD only their own, and a thread that is not theirs reads as missing
   * rather than forbidden, the same way `requireBoardAccess` 404s.
   */
  private async ownedConversation(
    user: SupportSocketUser,
    conversationId: string,
  ): Promise<SupportConversation | null> {
    const conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );
    if (!conversation) return null;
    if (user.role === 'admin') return conversation;
    return conversation.hodEmail.toLowerCase() === user.email.toLowerCase()
      ? conversation
      : null;
  }

  private async handleSend(
    ws: WebSocket,
    user: SupportSocketUser,
    requestedId: string | undefined,
    text: string,
    image?: { dataUrl: string; width: number; height: number },
  ): Promise<void> {
    let conversation: SupportConversation;

    if (requestedId) {
      const existing = await this.ownedConversation(user, requestedId);
      if (!existing) {
        this.send(ws, { type: 'error', message: 'That conversation no longer exists.' });
        return;
      }
      conversation = existing;
    } else if (user.role === 'admin') {
      // An admin always replies into an existing thread; they have no way to
      // open one, because a thread belongs to the HoD who raised it.
      this.send(ws, { type: 'error', message: 'No conversation selected.' });
      return;
    } else {
      // A HoD writing with no thread named is starting a new one. The opening
      // line becomes the subject, so a thread gets a title without anyone
      // being asked to invent one.
      const subject = (text || 'Image').slice(0, MAX_SUBJECT_LENGTH);
      conversation = this.newConversation(user, await this.nextReference(), subject);
    }

    const conversationId = conversation.conversationId;
    const now = new Date().toISOString();
    const seq = ((await this.state.storage.get<number>(seqKey(conversationId))) ?? 0) + 1;

    let stored: SupportImage | undefined;
    if (image) {
      const imageId = crypto.randomUUID();
      await this.state.storage.put(imgKey(imageId), image.dataUrl);
      stored = { id: imageId, width: image.width, height: image.height };
    }

    const message: SupportMessage = {
      id: crypto.randomUUID(),
      conversationId,
      authorEmail: user.email,
      authorName: user.name,
      authorRole: user.role,
      text,
      ...(stored ? { image: stored } : {}),
      sentAt: now,
    };

    // Delivered the moment it is sent, if the other side is actually here.
    // Otherwise their next connection moves the watermark (see sendInit).
    const recipientHere =
      user.role === 'hod'
        ? this.liveSockets('role:admin').length > 0
        : this.liveSockets(`user:${conversation.hodEmail.toLowerCase()}`).length > 0;

    conversation = {
      ...conversation,
      lastMessageAt: now,
      lastMessagePreview: (text || '📷 Image').slice(0, PREVIEW_LENGTH),
      // A HoD writing into a resolved thread reopens it — otherwise a
      // follow-up question would land in an archive nobody is watching.
      status: user.role === 'hod' ? 'open' : conversation.status,
      unreadForAdmin:
        user.role === 'hod' ? conversation.unreadForAdmin + 1 : conversation.unreadForAdmin,
      unreadForHod:
        user.role === 'admin' ? conversation.unreadForHod + 1 : conversation.unreadForHod,
      adminDeliveredAt:
        user.role === 'hod' && recipientHere ? now : conversation.adminDeliveredAt,
      hodDeliveredAt:
        user.role === 'admin' && recipientHere ? now : conversation.hodDeliveredAt,
      // A HoD writing into an empty desk starts the clock on emailing the
      // office. An existing deadline is kept, so five lines in a row is still
      // one notification rather than five postponements.
      notifyDueAt:
        user.role === 'hod' && !recipientHere
          ? (conversation.notifyDueAt ??
            new Date(Date.now() + NOTIFY_OFFICE_AFTER_MS).toISOString())
          : conversation.notifyDueAt,
    };

    await this.state.storage.put(msgKey(conversationId, seq), message);
    await this.state.storage.put(seqKey(conversationId), seq);
    await this.state.storage.put(convKey(conversationId), conversation);
    // `seq` only ever grows, so this skips the key listing entirely until a
    // thread is actually long enough to need trimming — which is never, for
    // essentially every conversation.
    if (seq > MAX_STORED_MESSAGES) await this.trim(conversationId);

    // The live frame carries the picture so it appears instantly for both
    // sides; history never does — it hands out ids and the client asks.
    const frame: SupportServerFrame = { type: 'message', message, conversation };
    this.toUser(conversation.hodEmail, frame);
    this.toAdmins(frame);

    if (image && stored) {
      const imageFrame: SupportServerFrame = {
        type: 'image',
        imageId: stored.id,
        dataUrl: image.dataUrl,
      };
      this.toUser(conversation.hodEmail, imageFrame);
      this.toAdmins(imageFrame);
    }

    // The alarm may need to fire sooner than the liveness sweep would, or at
    // all — an unanswered thread must still be chased with nobody connected.
    await this.scheduleNextAlarm();
  }

  private async handleImage(ws: WebSocket, imageId: string): Promise<void> {
    const dataUrl = (await this.state.storage.get<string>(imgKey(imageId))) ?? null;
    this.send(ws, { type: 'image', imageId, dataUrl });
  }

  /**
   * Typing is pure signal: nothing is stored, nothing is acknowledged, and it
   * is never sent back to the person typing. It goes only to the other side
   * of the conversation — an admin's keystrokes reach that HoD and nobody
   * else, which matters because a support thread is private to the two of
   * them.
   *
   * No storage write and no alarm: if it is lost, the receiver's TTL simply
   * expires and the indicator disappears, which is the correct outcome.
   */
  private handleTyping(user: SocketAttachment, requestedId: string | undefined): void {
    const conversationId =
      user.role === 'admin' ? requestedId?.toLowerCase() : user.email.toLowerCase();
    if (!conversationId) return;

    const frame: SupportServerFrame = {
      type: 'typing',
      conversationId,
      authorName: user.name,
      authorRole: user.role,
    };

    if (user.role === 'admin') this.toUser(conversationId, frame);
    else this.toAdmins(frame);
  }

  private async handleMarkRead(
    user: SupportSocketUser,
    rawId: string,
  ): Promise<void> {
    const conversation = await this.ownedConversation(user, rawId);
    if (!conversation) return;
    const conversationId = conversation.conversationId;

    // Opening a thread both clears the counter and moves this side's read
    // watermark — which is what turns the sender's ticks green.
    const now = new Date().toISOString();
    const updated: SupportConversation = {
      ...conversation,
      unreadForAdmin: user.role === 'admin' ? 0 : conversation.unreadForAdmin,
      unreadForHod: user.role === 'hod' ? 0 : conversation.unreadForHod,
      adminReadAt: user.role === 'admin' ? now : conversation.adminReadAt,
      adminDeliveredAt: user.role === 'admin' ? now : conversation.adminDeliveredAt,
      hodReadAt: user.role === 'hod' ? now : conversation.hodReadAt,
      hodDeliveredAt: user.role === 'hod' ? now : conversation.hodDeliveredAt,
      // An admin has now actually looked, so there is nothing to chase.
      notifyDueAt: user.role === 'admin' ? null : conversation.notifyDueAt,
    };

    // Nothing changed — don't spend a storage write or a broadcast on it.
    if (
      updated.unreadForAdmin === conversation.unreadForAdmin &&
      updated.unreadForHod === conversation.unreadForHod &&
      updated.adminReadAt === conversation.adminReadAt &&
      updated.hodReadAt === conversation.hodReadAt
    ) {
      return;
    }

    await this.state.storage.put(convKey(conversationId), updated);

    const frame: SupportServerFrame = { type: 'conversation', conversation: updated };
    this.toUser(updated.hodEmail, frame);
    this.toAdmins(frame);
  }

  private async handleResolve(
    ws: WebSocket,
    user: SupportSocketUser,
    rawId: string,
    category: SupportCategory,
  ): Promise<void> {
    if (user.role !== 'admin') {
      this.send(ws, {
        type: 'error',
        message: 'Only an administrator can resolve a conversation.',
      });
      return;
    }

    const conversation = await this.ownedConversation(user, rawId);
    if (!conversation) return;

    const updated: SupportConversation = {
      ...conversation,
      status: 'resolved',
      unreadForAdmin: 0,
      category,
      resolvedAt: new Date().toISOString(),
      // Answered, so there is nothing left for the office to be chased about.
      notifyDueAt: null,
    };
    await this.state.storage.put(convKey(conversation.conversationId), updated);

    const frame: SupportServerFrame = { type: 'conversation', conversation: updated };
    this.toUser(updated.hodEmail, frame);
    this.toAdmins(frame);
  }

  private async handleHistory(
    ws: WebSocket,
    user: SupportSocketUser,
    rawId: string,
  ): Promise<void> {
    // Reading someone else's transcript returns an empty one rather than an
    // error, so a stale id in a client cannot probe for what exists.
    const conversation = await this.ownedConversation(user, rawId);

    this.send(ws, {
      type: 'history',
      conversationId: rawId,
      messages: conversation
        ? await this.messagesFor(conversation.conversationId)
        : [],
    });
  }

  // ── Sending ────────────────────────────────────────────────────────

  private async sendInit(ws: WebSocket, user: SupportSocketUser): Promise<void> {
    const presence = this.presence();

    // Coming online is what makes everything already waiting "delivered" —
    // the single tick on the sender's side becomes a double one.
    await this.markDelivered(user.role === 'admin' ? 'admin' : 'hod', user.email);

    // Both roles get a list now: an admin every thread, a HoD their own.
    // Transcripts are fetched per thread on open, so a HoD with a dozen past
    // questions does not drag a dozen transcripts down on connect.
    const all = await this.allConversations();
    const conversations =
      user.role === 'admin'
        ? all
        : all.filter(
            (c) => c.hodEmail.toLowerCase() === user.email.toLowerCase(),
          );

    this.send(ws, {
      type: 'init',
      presence,
      conversations,
      ...(user.role === 'hod' ? { boards: user.boards ?? [] } : {}),
    });
  }

  /**
   * Move a side's delivered watermark to now, because they just connected.
   *
   * Only threads with something actually waiting are touched, so a quiet desk
   * costs one `list` and no writes.
   */
  private async markDelivered(side: 'admin' | 'hod', email: string): Promise<void> {
    const now = new Date().toISOString();

    const all = await this.allConversations();
    // An admin serves every thread; a HoD only the ones they raised.
    const targets =
      side === 'admin'
        ? all
        : all.filter((c) => c.hodEmail.toLowerCase() === email.toLowerCase());

    for (const conversation of targets) {
      // Nothing unread for this side means nothing to mark.
      const pending =
        side === 'admin' ? conversation.unreadForAdmin : conversation.unreadForHod;
      if (pending === 0) continue;

      const updated: SupportConversation = {
        ...conversation,
        adminDeliveredAt: side === 'admin' ? now : conversation.adminDeliveredAt,
        hodDeliveredAt: side === 'hod' ? now : conversation.hodDeliveredAt,
      };

      await this.state.storage.put(convKey(conversation.conversationId), updated);

      const frame: SupportServerFrame = { type: 'conversation', conversation: updated };
      this.toUser(updated.hodEmail, frame);
      this.toAdmins(frame);
    }
  }

  private send(ws: WebSocket, frame: SupportServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // The socket died between our lookup and this write. Presence will be
      // corrected by the close handler; there is nothing useful to do here.
    }
  }

  /** Sockets on a tag that are still answering pings — see `isAlive`. */
  private liveSockets(tag: string): WebSocket[] {
    return this.state.getWebSockets(tag).filter((s) => this.isAlive(s));
  }

  private toAdmins(frame: SupportServerFrame): void {
    for (const socket of this.state.getWebSockets('role:admin')) {
      this.send(socket, frame);
    }
  }

  private toUser(email: string, frame: SupportServerFrame): void {
    for (const socket of this.state.getWebSockets(`user:${email.toLowerCase()}`)) {
      this.send(socket, frame);
    }
  }

  /**
   * `closing` is the socket whose close/error handler we are running inside.
   * Whether the runtime has already dropped it from `getWebSockets()` at that
   * point is not something to depend on — excluding it explicitly makes the
   * count right either way, and stops us writing to a socket that is going
   * away anyway.
   */
  private broadcastPresence(closing?: WebSocket): void {
    const frame: SupportServerFrame = {
      type: 'presence',
      presence: this.presence(closing),
    };
    for (const socket of this.state.getWebSockets()) {
      if (socket !== closing) this.send(socket, frame);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────

  /**
   * Counted by distinct email, not by socket: an admin with the portal open
   * in three tabs is one person available to answer, and telling a HoD that
   * "3 administrators are online" would be a lie.
   */
  private presence(closing?: WebSocket): SupportPresence {
    const byEmail = new Map<string, string>();

    for (const socket of this.state.getWebSockets('role:admin')) {
      if (socket === closing || !this.isAlive(socket)) continue;
      const user = socket.deserializeAttachment() as SocketAttachment | null;
      if (user) byEmail.set(user.email.toLowerCase(), user.name);
    }

    return {
      adminsOnline: byEmail.size,
      adminNames: [...byEmail.values()].sort((a, b) => a.localeCompare(b)),
    };
  }

  /**
   * References are sequential rather than random so they can be read out on
   * the phone. The counter lives in storage, which the single-threaded object
   * makes safe to increment without a lock.
   */
  private async nextReference(): Promise<string> {
    const seq =
      ((await this.state.storage.get<number>('refSeq')) ?? SUPPORT_REFERENCE_START) + 1;
    await this.state.storage.put('refSeq', seq);
    return `${SUPPORT_REFERENCE_PREFIX}-${seq}`;
  }

  private newConversation(
    user: SupportSocketUser,
    reference: string,
    subject: string,
  ): SupportConversation {
    const now = new Date().toISOString();
    return {
      conversationId: crypto.randomUUID(),
      reference,
      subject,
      category: null,
      resolvedAt: null,
      hodEmail: user.email,
      hodName: user.name,
      departments: user.departments,
      status: 'open',
      createdAt: now,
      lastMessageAt: now,
      lastMessagePreview: '',
      unreadForAdmin: 0,
      unreadForHod: 0,
      hodDeliveredAt: null,
      hodReadAt: null,
      adminDeliveredAt: null,
      adminReadAt: null,
      boardId: null,
      boardProgramme: null,
      notifyDueAt: null,
      notifiedAt: null,
    };
  }

  private async allConversations(): Promise<SupportConversation[]> {
    const stored = await this.state.storage.list<SupportConversation>({
      prefix: 'conv:',
    });
    return [...stored.values()].sort((a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt),
    );
  }

  private async messagesFor(conversationId: string): Promise<SupportMessage[]> {
    const stored = await this.state.storage.list<SupportMessage>({
      prefix: msgPrefix(conversationId),
      limit: HISTORY_LIMIT,
      // Newest first so the limit keeps the *recent* end of a long thread…
      reverse: true,
    });
    // …then flip back, because the transcript reads oldest to newest.
    return [...stored.values()].reverse();
  }

  private async trim(conversationId: string): Promise<void> {
    const stored = await this.state.storage.list<SupportMessage>({
      prefix: msgPrefix(conversationId),
    });
    const entries = [...stored.entries()];
    if (entries.length <= MAX_STORED_MESSAGES) return;

    const dropped = entries.slice(0, entries.length - MAX_STORED_MESSAGES);

    // Delete each dropped message's picture too, or the bytes outlive the
    // message forever with nothing left pointing at them.
    await this.state.storage.delete([
      ...dropped.map(([key]) => key),
      ...dropped
        .map(([, message]) => message.image?.id)
        .filter((id): id is string => Boolean(id))
        .map(imgKey),
    ]);
  }
}

/** Re-exported so the route and the DO cannot disagree about the instance name. */
export { SUPPORT_DESK_ID };
