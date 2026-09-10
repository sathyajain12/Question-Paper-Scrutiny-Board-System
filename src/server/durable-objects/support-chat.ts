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
import { SUPPORT_DESK_ID } from '@shared/constants/support';
import type {
  Role,
  SupportConversation,
  SupportMessage,
  SupportPresence,
  SupportServerFrame,
} from '@shared/types';

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

export class SupportChat implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {
    void this.env;
  }

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
    await this.scheduleSweep();

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
    await this.scheduleSweep();
  }

  /** Keeps one alarm pending while anyone is connected, and none when idle. */
  private async scheduleSweep(): Promise<void> {
    if (this.state.getWebSockets().length === 0) return;
    if ((await this.state.storage.getAlarm()) !== null) return;
    await this.state.storage.setAlarm(Date.now() + LIVENESS_SWEEP_MS);
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
        await this.handleSend(ws, user, frame.conversationId, frame.text);
        return;
      case 'typing':
        this.handleTyping(user, frame.conversationId);
        return;
      case 'markRead':
        await this.handleMarkRead(user, frame.conversationId);
        return;
      case 'resolve':
        await this.handleResolve(ws, user, frame.conversationId);
        return;
      case 'history':
        await this.handleHistory(ws, user, frame.conversationId);
        return;
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────

  private async handleSend(
    ws: WebSocket,
    user: SupportSocketUser,
    requestedId: string | undefined,
    text: string,
  ): Promise<void> {
    // A HoD always writes to their own thread. Ignoring `requestedId` here is
    // the same rule the HTTP side follows: authority comes from the session,
    // never from the payload (docs §6).
    const conversationId =
      user.role === 'admin'
        ? requestedId?.toLowerCase()
        : user.email.toLowerCase();

    if (!conversationId) {
      this.send(ws, { type: 'error', message: 'No conversation selected.' });
      return;
    }

    let conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );

    if (!conversation) {
      if (user.role === 'admin') {
        this.send(ws, { type: 'error', message: 'That conversation no longer exists.' });
        return;
      }
      conversation = this.newConversation(user);
    }

    const now = new Date().toISOString();
    const seq = ((await this.state.storage.get<number>(seqKey(conversationId))) ?? 0) + 1;

    const message: SupportMessage = {
      id: crypto.randomUUID(),
      conversationId,
      authorEmail: user.email,
      authorName: user.name,
      authorRole: user.role,
      text,
      sentAt: now,
    };

    conversation = {
      ...conversation,
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, PREVIEW_LENGTH),
      // A HoD writing into a resolved thread reopens it — otherwise a
      // follow-up question would land in an archive nobody is watching.
      status: user.role === 'hod' ? 'open' : conversation.status,
      unreadForAdmin:
        user.role === 'hod' ? conversation.unreadForAdmin + 1 : conversation.unreadForAdmin,
      unreadForHod:
        user.role === 'admin' ? conversation.unreadForHod + 1 : conversation.unreadForHod,
    };

    await this.state.storage.put(msgKey(conversationId, seq), message);
    await this.state.storage.put(seqKey(conversationId), seq);
    await this.state.storage.put(convKey(conversationId), conversation);
    // `seq` only ever grows, so this skips the key listing entirely until a
    // thread is actually long enough to need trimming — which is never, for
    // essentially every conversation.
    if (seq > MAX_STORED_MESSAGES) await this.trim(conversationId);

    const frame: SupportServerFrame = { type: 'message', message, conversation };
    this.toUser(conversation.hodEmail, frame);
    this.toAdmins(frame);
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
    const conversationId =
      user.role === 'admin' ? rawId.toLowerCase() : user.email.toLowerCase();

    const conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );
    if (!conversation) return;

    const updated: SupportConversation = {
      ...conversation,
      unreadForAdmin: user.role === 'admin' ? 0 : conversation.unreadForAdmin,
      unreadForHod: user.role === 'hod' ? 0 : conversation.unreadForHod,
    };

    // Nothing changed — don't spend a storage write or a broadcast on it.
    if (
      updated.unreadForAdmin === conversation.unreadForAdmin &&
      updated.unreadForHod === conversation.unreadForHod
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
  ): Promise<void> {
    if (user.role !== 'admin') {
      this.send(ws, {
        type: 'error',
        message: 'Only an administrator can resolve a conversation.',
      });
      return;
    }

    const conversationId = rawId.toLowerCase();
    const conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );
    if (!conversation) return;

    const updated: SupportConversation = {
      ...conversation,
      status: 'resolved',
      unreadForAdmin: 0,
    };
    await this.state.storage.put(convKey(conversationId), updated);

    const frame: SupportServerFrame = { type: 'conversation', conversation: updated };
    this.toUser(updated.hodEmail, frame);
    this.toAdmins(frame);
  }

  private async handleHistory(
    ws: WebSocket,
    user: SupportSocketUser,
    rawId: string,
  ): Promise<void> {
    // A HoD may only ever read their own thread, whatever they asked for.
    const conversationId =
      user.role === 'admin' ? rawId.toLowerCase() : user.email.toLowerCase();

    this.send(ws, {
      type: 'history',
      conversationId,
      messages: await this.messagesFor(conversationId),
    });
  }

  // ── Sending ────────────────────────────────────────────────────────

  private async sendInit(ws: WebSocket, user: SupportSocketUser): Promise<void> {
    const presence = this.presence();

    if (user.role === 'admin') {
      this.send(ws, {
        type: 'init',
        presence,
        conversations: await this.allConversations(),
      });
      return;
    }

    const conversationId = user.email.toLowerCase();
    const conversation = await this.state.storage.get<SupportConversation>(
      convKey(conversationId),
    );

    this.send(ws, {
      type: 'init',
      presence,
      // No thread yet is the normal first-visit case, not an error — the
      // conversation is created lazily by the first message.
      conversation: conversation ?? undefined,
      messages: conversation ? await this.messagesFor(conversationId) : [],
    });
  }

  private send(ws: WebSocket, frame: SupportServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // The socket died between our lookup and this write. Presence will be
      // corrected by the close handler; there is nothing useful to do here.
    }
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

  private newConversation(user: SupportSocketUser): SupportConversation {
    const now = new Date().toISOString();
    return {
      conversationId: user.email.toLowerCase(),
      hodEmail: user.email,
      hodName: user.name,
      departments: user.departments,
      status: 'open',
      createdAt: now,
      lastMessageAt: now,
      lastMessagePreview: '',
      unreadForAdmin: 0,
      unreadForHod: 0,
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
    const keys = [
      ...(
        await this.state.storage.list<SupportMessage>({
          prefix: msgPrefix(conversationId),
        })
      ).keys(),
    ];
    if (keys.length <= MAX_STORED_MESSAGES) return;

    await this.state.storage.delete(keys.slice(0, keys.length - MAX_STORED_MESSAGES));
  }
}

/** Re-exported so the route and the DO cannot disagree about the instance name. */
export { SUPPORT_DESK_ID };
