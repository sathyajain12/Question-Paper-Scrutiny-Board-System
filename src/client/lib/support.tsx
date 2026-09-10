/**
 * Support-desk socket, shared by the HoD help widget and the admin inbox.
 *
 * The connection is owned by AppLayout, not by either screen, and that is
 * deliberate: an administrator counts as "online" while they have the portal
 * open, not only while they happen to be sitting on the Support page. Holding
 * the socket at the layout level is what makes the presence a HoD sees mean
 * "someone is on the portal right now" — which is exactly the promise the
 * offline panel's phone number is the fallback for.
 *
 * It also means both roles get pushed messages with the screen closed, which
 * is what drives the unread badges.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Role,
  SessionUser,
  SupportConversation,
  SupportMessage,
  SupportPresence,
  SupportServerFrame,
} from '@shared/types';
import type { SupportClientFrame } from '@shared/schemas/support';
import { TYPING_THROTTLE_MS, TYPING_TTL_MS } from '@shared/constants/support';
import { withDevUser } from './api';

/** Who is currently typing in a conversation, as far as this client knows. */
export interface TypingPeer {
  name: string;
  role: Role;
}

export type SupportStatus = 'connecting' | 'online' | 'offline';

interface SupportContextValue {
  status: SupportStatus;
  presence: SupportPresence;
  /** HoD: their own thread. Undefined until they send the first message. */
  conversation: SupportConversation | undefined;
  /** Admin: every thread, most recent activity first. */
  conversations: SupportConversation[];
  /** Keyed by conversationId. The HoD only ever holds their own. */
  messagesByConversation: Record<string, SupportMessage[]>;
  /** Keyed by conversationId; absent once the TTL lapses. */
  typingByConversation: Record<string, TypingPeer>;
  /** Last rejection from the server — a too-long message, a stale thread. */
  error: string | null;
  send: (text: string, conversationId?: string) => void;
  /** Call on every keystroke — throttling happens here, not at the call site. */
  notifyTyping: (conversationId?: string) => void;
  markRead: (conversationId: string) => void;
  resolve: (conversationId: string) => void;
  requestHistory: (conversationId: string) => void;
  clearError: () => void;
}

const FALLBACK: SupportContextValue = {
  status: 'offline',
  presence: { adminsOnline: 0, adminNames: [] },
  conversation: undefined,
  conversations: [],
  messagesByConversation: {},
  typingByConversation: {},
  error: null,
  send: () => {},
  notifyTyping: () => {},
  markRead: () => {},
  resolve: () => {},
  requestHistory: () => {},
  clearError: () => {},
};

const SupportContext = createContext<SupportContextValue>(FALLBACK);

export const useSupport = () => useContext(SupportContext);

/** Backoff between reconnect attempts, in ms. Caps rather than growing forever. */
const RETRY_DELAYS = [1000, 2000, 5000, 10_000, 30_000];

/**
 * Heartbeat. The desk marks a socket dead if it stops answering, which is how
 * a closed laptop stops being reported to HoDs as "an admin is online". The
 * Workers runtime replies to these itself without waking the Durable Object,
 * so the cost is a few bytes each way. Must stay comfortably under the
 * server's LIVENESS_TIMEOUT_MS.
 */
const PING = 'ping';
const PONG = 'pong';
const HEARTBEAT_MS = 30_000;

function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // withDevUser keeps ?as= impersonation working on the socket exactly as it
  // does on fetch — otherwise the desk would always see the default dev user.
  return `${scheme}//${window.location.host}/api${withDevUser('/support/ws')}`;
}

export function SupportProvider({
  user,
  children,
}: {
  user: SessionUser | undefined;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<SupportStatus>('connecting');
  const [presence, setPresence] = useState<SupportPresence>({
    adminsOnline: 0,
    adminNames: [],
  });
  const [conversation, setConversation] = useState<SupportConversation>();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [messagesByConversation, setMessages] = useState<
    Record<string, SupportMessage[]>
  >({});
  const [typingByConversation, setTyping] = useState<Record<string, TypingPeer>>({});
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** One pending "hide the indicator" timer per conversation. */
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** When we last told the server we were typing, per conversation. */
  const typingSentRef = useRef<Map<string, number>>(new Map());

  // Only HoDs and admins have a desk; viewers (and the signed-out state) skip
  // the socket entirely rather than connecting to be refused.
  const enabled = user?.role === 'admin' || user?.role === 'hod';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    let disposed = false;

    const clearTyping = (id: string) => {
      const timers = typingTimersRef.current;
      const pending = timers.get(id);
      if (pending) clearTimeout(pending);
      timers.delete(id);
      setTyping((prev) => {
        if (!(id in prev)) return prev; // Avoid a pointless re-render.
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const upsertConversation = (next: SupportConversation) =>
      setConversations((prev) => {
        const rest = prev.filter((c) => c.conversationId !== next.conversationId);
        return [next, ...rest].sort((a, b) =>
          b.lastMessageAt.localeCompare(a.lastMessageAt),
        );
      });

    const handle = (frame: SupportServerFrame) => {
      switch (frame.type) {
        case 'init':
          setPresence(frame.presence);
          if (frame.conversations) setConversations(frame.conversations);
          if (frame.conversation) setConversation(frame.conversation);
          if (frame.messages && frame.conversation) {
            const id = frame.conversation.conversationId;
            setMessages((prev) => ({ ...prev, [id]: frame.messages ?? [] }));
          }
          return;

        case 'presence':
          setPresence(frame.presence);
          return;

        case 'message': {
          const id = frame.message.conversationId;
          setMessages((prev) => {
            const existing = prev[id] ?? [];
            // The sender receives their own message back from the server —
            // that echo is what carries the authoritative id and timestamp.
            if (existing.some((m) => m.id === frame.message.id)) return prev;
            return { ...prev, [id]: [...existing, frame.message] };
          });
          upsertConversation(frame.conversation);
          if (!isAdmin) setConversation(frame.conversation);
          // The message *is* the end of typing — don't make the reader watch
          // a stale indicator hang around under text that has already landed.
          clearTyping(id);
          return;
        }

        case 'typing': {
          const id = frame.conversationId;
          setTyping((prev) => ({
            ...prev,
            [id]: { name: frame.authorName, role: frame.authorRole },
          }));

          // Restart the countdown on every frame. No "stopped typing" message
          // exists, so this timeout is the only thing that hides it.
          const timers = typingTimersRef.current;
          const pending = timers.get(id);
          if (pending) clearTimeout(pending);
          timers.set(
            id,
            setTimeout(() => clearTyping(id), TYPING_TTL_MS),
          );
          return;
        }

        case 'conversation':
          upsertConversation(frame.conversation);
          if (!isAdmin) setConversation(frame.conversation);
          return;

        case 'history':
          setMessages((prev) => ({ ...prev, [frame.conversationId]: frame.messages }));
          return;

        case 'error':
          setError(frame.message);
          return;
      }
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');

      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl());
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        retryRef.current = 0;
        setStatus('online');

        heartbeatRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(PING);
        }, HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        if (disposed || typeof event.data !== 'string') return;
        // The runtime's auto-response — not JSON, and nothing to do with it.
        if (event.data === PONG) return;
        try {
          handle(JSON.parse(event.data) as SupportServerFrame);
        } catch {
          // A frame we can't parse is a bug on our side, not something the
          // user can act on. Dropping it beats tearing down the connection.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        setStatus('offline');
        // Our own presence is gone too — don't keep showing a stale roster.
        setPresence({ adminsOnline: 0, adminNames: [] });
        scheduleRetry();
      };

      socket.onerror = () => socket.close();
    };

    const scheduleRetry = () => {
      if (disposed) return;
      const delay =
        RETRY_DELAYS[Math.min(retryRef.current, RETRY_DELAYS.length - 1)] ?? 30_000;
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      for (const t of typingTimersRef.current.values()) clearTimeout(t);
      typingTimersRef.current.clear();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, isAdmin]);

  const post = useCallback((frame: SupportClientFrame) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(frame));
    return true;
  }, []);

  const send = useCallback(
    (text: string, conversationId?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!post({ type: 'send', conversationId, text: trimmed })) {
        setError('Not connected — your message was not sent. Retrying…');
      }
    },
    [post],
  );

  /**
   * Throttled here rather than at the call site, so callers can fire this on
   * every keystroke without thinking about it. A fast typist would otherwise
   * put a frame on the wire per character.
   */
  const notifyTyping = useCallback(
    (conversationId?: string) => {
      const key = conversationId ?? 'self';
      const now = Date.now();
      const last = typingSentRef.current.get(key) ?? 0;
      if (now - last < TYPING_THROTTLE_MS) return;

      if (post({ type: 'typing', conversationId })) {
        typingSentRef.current.set(key, now);
      }
    },
    [post],
  );

  const markRead = useCallback(
    (conversationId: string) => void post({ type: 'markRead', conversationId }),
    [post],
  );

  const resolve = useCallback(
    (conversationId: string) => void post({ type: 'resolve', conversationId }),
    [post],
  );

  const requestHistory = useCallback(
    (conversationId: string) => void post({ type: 'history', conversationId }),
    [post],
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<SupportContextValue>(
    () => ({
      status,
      presence,
      conversation,
      conversations,
      messagesByConversation,
      typingByConversation,
      error,
      send,
      notifyTyping,
      markRead,
      resolve,
      requestHistory,
      clearError,
    }),
    [
      status,
      presence,
      conversation,
      conversations,
      messagesByConversation,
      typingByConversation,
      error,
      send,
      notifyTyping,
      markRead,
      resolve,
      requestHistory,
      clearError,
    ],
  );

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

/** Total unread across every thread — drives the admin nav badge. */
export function useAdminUnreadCount(): number {
  const { conversations } = useSupport();
  return conversations.reduce((total, c) => total + c.unreadForAdmin, 0);
}
