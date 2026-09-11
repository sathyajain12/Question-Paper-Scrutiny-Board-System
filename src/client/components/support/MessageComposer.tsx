import { useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { MAX_SUPPORT_MESSAGE_LENGTH } from '@shared/constants/support';
import { imageFromClipboard, prepareImage, type PreparedImage } from '@/lib/image';
import { Button } from '../ui/Button';

/**
 * The message box, shared by the HoD widget and the admin desk.
 *
 * An image can arrive three ways — the button, a paste, or a drop — and all
 * three land in the same place: compressed in the browser, previewed, and
 * sent with (or without) text. Compression happens before the preview so what
 * you see is exactly what the other side gets.
 */
export function MessageComposer({
  placeholder,
  disabled,
  onSend,
  onTyping,
}: {
  placeholder: string;
  disabled: boolean;
  onSend: (text: string, image?: PreparedImage) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const overLimit = text.length > MAX_SUPPORT_MESSAGE_LENGTH;
  const canSend = (text.trim().length > 0 || image !== null) && !overLimit && !disabled;

  async function attach(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      setImage(await prepareImage(file));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That image could not be attached.');
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    onSend(text.trim(), image ?? undefined);
    setText('');
    setImage(null);
    setProblem(null);
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        void attach(file);
      }}
      className="border-t border-slate-200 px-3 py-3"
    >
      {problem && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {problem}
        </p>
      )}

      {image && (
        <div className="relative mb-2 inline-block">
          <img
            src={image.dataUrl}
            alt="Attachment preview"
            className="h-24 w-auto rounded-md ring-1 ring-slate-200"
          />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove image"
            className="absolute -top-2 -right-2 rounded-full bg-slate-800 p-1 text-white transition hover:bg-slate-900"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void attach(file);
            // Reset so picking the same file twice still fires a change.
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Attach an image"
          title="Attach an image"
          className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50"
        >
          <ImagePlus className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) onTyping();
            }}
            onPaste={(e) => {
              const file = imageFromClipboard(e.nativeEvent);
              if (!file) return;
              e.preventDefault();
              void attach(file);
            }}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={busy ? 'Preparing image…' : placeholder}
            aria-label={placeholder}
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          />
          {overLimit && (
            <p className="mt-1 text-xs text-red-600">
              {text.length} / {MAX_SUPPORT_MESSAGE_LENGTH} characters.
            </p>
          )}
        </div>

        <Button type="submit" loading={busy} disabled={!canSend}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </form>
  );
}
