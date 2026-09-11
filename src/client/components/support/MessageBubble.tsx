import { useEffect } from 'react';
import { Check, CheckCheck, ImageOff } from 'lucide-react';
import type { SupportConversation, SupportMessage, SupportReceipt } from '@shared/types';
import { receiptFor } from '@shared/domain/support-receipt';
import { formatChatTime } from '@/lib/format';
import { useSupport } from '@/lib/support';

/**
 * One message, used by both the HoD widget and the admin desk.
 *
 * Shared rather than duplicated because the receipt ticks and the lazy image
 * fetch are fiddly enough that two copies would drift — and a tick that means
 * different things on the two screens is worse than no tick at all.
 */
export function MessageBubble({
  message,
  conversation,
  mine,
  showAuthor,
}: {
  message: SupportMessage;
  conversation: SupportConversation | undefined;
  /** Whether this viewer sent it — decides side, colour, and whether ticks show. */
  mine: boolean;
  showAuthor?: boolean;
}) {
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {showAuthor && !mine && (
        <p className="mb-0.5 text-xs font-semibold text-slate-500">
          {message.authorName}
        </p>
      )}

      <div
        className={`max-w-[85%] overflow-hidden rounded-lg ${
          mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {message.image && (
          <ChatImage
            imageId={message.image.id}
            width={message.image.width}
            height={message.image.height}
          />
        )}

        {message.text && (
          <p className="px-3 py-2 text-sm whitespace-pre-wrap">{message.text}</p>
        )}
      </div>

      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
        {formatChatTime(message.sentAt)}
        {/* A receipt describes the recipient, so it only belongs on your own. */}
        {mine && <Receipt state={receiptFor(message, conversation)} />}
      </p>
    </div>
  );
}

const RECEIPT_LABEL: Record<SupportReceipt, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

function Receipt({ state }: { state: SupportReceipt }) {
  const Icon = state === 'sent' ? Check : CheckCheck;

  return (
    <span
      title={RECEIPT_LABEL[state]}
      className={state === 'read' ? 'text-emerald-600' : 'text-slate-400'}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{RECEIPT_LABEL[state]}</span>
    </span>
  );
}

/**
 * Transcripts carry image ids, not pictures — 200 messages of inline base64
 * would be tens of megabytes. The bytes are asked for when the bubble mounts
 * and cached in the provider, so scrolling back does not re-fetch.
 */
function ChatImage({
  imageId,
  width,
  height,
}: {
  imageId: string;
  width: number;
  height: number;
}) {
  const { imagesById, requestImage } = useSupport();
  const dataUrl = imagesById[imageId];

  useEffect(() => {
    if (!dataUrl) requestImage(imageId);
  }, [dataUrl, imageId, requestImage]);

  // Reserve the real aspect ratio up front so the transcript does not jump
  // when the picture lands.
  const ratio = `${width} / ${height}`;

  if (!dataUrl) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className="flex w-64 max-w-full animate-pulse items-center justify-center bg-slate-200"
      >
        <ImageOff className="h-5 w-5 text-slate-400" aria-hidden="true" />
        <span className="sr-only">Loading image</span>
      </div>
    );
  }

  return (
    <a href={dataUrl} target="_blank" rel="noreferrer" className="block">
      <img
        src={dataUrl}
        alt="Attachment"
        style={{ aspectRatio: ratio }}
        className="w-64 max-w-full object-cover"
      />
    </a>
  );
}
