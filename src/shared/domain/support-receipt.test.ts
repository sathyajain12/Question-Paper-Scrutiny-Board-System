import { describe, expect, it } from 'vitest';
import type { SupportConversation, SupportMessage } from '../types';
import { receiptFor } from './support-receipt';

/**
 * The tick rule is watermark arithmetic, and getting it wrong is invisible
 * until someone waits for a reply that was never delivered. These pin the
 * boundaries — especially "sent at exactly the watermark" and "sent after it".
 */
const T = {
  early: '2026-09-11T10:00:00.000Z',
  mid: '2026-09-11T10:05:00.000Z',
  late: '2026-09-11T10:10:00.000Z',
};

function conversation(over: Partial<SupportConversation> = {}): SupportConversation {
  return {
    conversationId: 'c-1',
    reference: 'QPSB-101',
    subject: 'Test thread',
    category: null,
    resolvedAt: null,
    hodEmail: 'hod@x.edu',
    hodName: 'HoD',
    departments: ['Physics'],
    status: 'open',
    createdAt: T.early,
    lastMessageAt: T.late,
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
    ...over,
  };
}

function message(authorRole: 'hod' | 'admin', sentAt: string): SupportMessage {
  return {
    id: 'm1',
    conversationId: 'hod@x.edu',
    authorEmail: authorRole === 'hod' ? 'hod@x.edu' : 'coe@x.edu',
    authorName: authorRole === 'hod' ? 'HoD' : 'COE',
    authorRole,
    text: 'hello',
    sentAt,
  };
}

describe('receiptFor', () => {
  it('is "sent" when the recipient has never connected', () => {
    expect(receiptFor(message('hod', T.mid), conversation())).toBe('sent');
  });

  it('is "sent" when the recipient was last seen before the message', () => {
    const conv = conversation({ adminDeliveredAt: T.early });
    expect(receiptFor(message('hod', T.mid), conv)).toBe('sent');
  });

  it('is "delivered" once the recipient has connected since', () => {
    const conv = conversation({ adminDeliveredAt: T.late });
    expect(receiptFor(message('hod', T.mid), conv)).toBe('delivered');
  });

  it('is "read" once the recipient has opened the thread since', () => {
    const conv = conversation({ adminDeliveredAt: T.late, adminReadAt: T.late });
    expect(receiptFor(message('hod', T.mid), conv)).toBe('read');
  });

  it('counts a watermark exactly equal to sentAt as reached', () => {
    const conv = conversation({ adminDeliveredAt: T.mid });
    expect(receiptFor(message('hod', T.mid), conv)).toBe('delivered');
  });

  it('does not let an older read watermark cover a newer message', () => {
    // The regression that matters: reading at 10:05 must not mark a message
    // sent at 10:10 as already read.
    const conv = conversation({ adminDeliveredAt: T.mid, adminReadAt: T.mid });
    expect(receiptFor(message('hod', T.late), conv)).toBe('sent');
  });

  it('reads the other side of the conversation for an admin message', () => {
    // An admin's message is judged by the HoD's watermarks, not the admin's.
    const conv = conversation({ adminReadAt: T.late, hodDeliveredAt: T.late });
    expect(receiptFor(message('admin', T.mid), conv)).toBe('delivered');
  });

  it('falls back to "sent" when the conversation is not loaded yet', () => {
    expect(receiptFor(message('hod', T.mid), undefined)).toBe('sent');
  });
});
