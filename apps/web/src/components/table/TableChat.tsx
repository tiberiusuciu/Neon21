import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TABLE_CHAT_MAX_LEN, type TableChatMessage } from "@neon21/shared";

type Props = {
  messages: TableChatMessage[];
  selfUserId: string | null;
  onSend: (text: string) => void;
};

const PEEK_MS = 4500;
const PEEK_MAX = 2;

type Peek = { id: string; msg: TableChatMessage };

function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function countUnread(
  messages: TableChatMessage[],
  lastReadId: string | null,
  selfUserId: string | null
): number {
  if (lastReadId == null) return 0;
  const idx = messages.findIndex((m) => m.id === lastReadId);
  const after = idx >= 0 ? messages.slice(idx + 1) : messages;
  return after.filter(
    (m) =>
      m.kind !== "system" &&
      (!selfUserId || m.userId !== selfUserId)
  ).length;
}

function withoutOwnPresence(
  messages: TableChatMessage[],
  selfUserId: string | null
): TableChatMessage[] {
  if (!selfUserId) return messages;
  return messages.filter(
    (m) =>
      !(
        m.kind === "system" &&
        m.userId === selfUserId &&
        (m.text === "has joined" || m.text === "has left")
      )
  );
}

function PeekLine({
  msg,
  selfUserId,
}: {
  msg: TableChatMessage;
  selfUserId: string | null;
}) {
  const mine = selfUserId != null && msg.userId === selfUserId;
  const system = msg.kind === "system";
  return (
    <div
      className={`table-chat-line${mine ? " is-mine" : ""}${system ? " is-system" : ""}`}
    >
      {system ? (
        <span className="table-chat-system">
          {msg.name} {msg.text}
        </span>
      ) : (
        <>
          <span className="table-chat-name">{msg.name}</span>
          <span className="table-chat-text">{msg.text}</span>
        </>
      )}
    </div>
  );
}

export function TableChat({ messages, selfUserId, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [peeks, setPeeks] = useState<Peek[]>([]);
  const [unread, setUnread] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPeekId = useRef<string | null>(null);
  const lastReadId = useRef<string | null>(null);
  const seeded = useRef(false);
  const peekTimers = useRef(new Map<string, number>());

  const feed = useMemo(
    () => withoutOwnPresence(messages, selfUserId),
    [messages, selfUserId]
  );
  const visible = feed.slice(-8);

  function clearPeekTimer(id: string) {
    const t = peekTimers.current.get(id);
    if (t == null) return;
    window.clearTimeout(t);
    peekTimers.current.delete(id);
  }

  function clearAllPeeks() {
    for (const id of peekTimers.current.keys()) clearPeekTimer(id);
    setPeeks([]);
  }

  function schedulePeekDismiss(id: string) {
    clearPeekTimer(id);
    peekTimers.current.set(
      id,
      window.setTimeout(() => {
        peekTimers.current.delete(id);
        setPeeks((prev) => prev.filter((p) => p.id !== id));
      }, PEEK_MS)
    );
  }

  function enqueuePeeks(incoming: TableChatMessage[]) {
    for (const msg of incoming) {
      setPeeks((prev) => {
        const without = prev.filter((p) => p.id !== msg.id);
        let next = without;
        while (next.length >= PEEK_MAX) {
          const oldest = next[0]!;
          clearPeekTimer(oldest.id);
          next = next.slice(1);
        }
        return [...next, { id: msg.id, msg }];
      });
      schedulePeekDismiss(msg.id);
    }
  }

  useEffect(() => {
    if (seeded.current) return;
    if (!feed.length) return;
    seeded.current = true;
    const tail = feed[feed.length - 1]!.id;
    lastReadId.current = tail;
    lastPeekId.current = tail;
  }, [feed]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el || !open) return;
    el.scrollTop = el.scrollHeight;
  }, [feed.length, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    lastReadId.current = feed[feed.length - 1]?.id ?? lastReadId.current;
    setUnread(0);
    clearAllPeeks();
  }, [open, feed]);

  useEffect(() => {
    if (open) return;
    setUnread(countUnread(feed, lastReadId.current, selfUserId));
  }, [feed, open, selfUserId]);

  useEffect(() => {
    if (open || !feed.length) return;
    const latest = feed[feed.length - 1]!;
    if (latest.id === lastPeekId.current) return;
    const prevId = lastPeekId.current;
    const prevIdx =
      prevId == null ? -1 : feed.findIndex((m) => m.id === prevId);
    const fresh = (prevIdx >= 0 ? feed.slice(prevIdx + 1) : [latest]).filter(
      (m) => m.kind !== "system"
    );
    lastPeekId.current = latest.id;
    if (!fresh.length) return;
    enqueuePeeks(fresh);
  }, [feed, open]);

  useEffect(() => {
    function onGlobalKey(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "/" || e.key === "?") {
        e.preventDefault();
        clearAllPeeks();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  useEffect(
    () => () => {
      for (const id of peekTimers.current.keys()) clearPeekTimer(id);
    },
    []
  );

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, TABLE_CHAT_MAX_LEN));
    setDraft("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setDraft("");
    }
  }

  function openChat() {
    clearAllPeeks();
    setOpen(true);
  }

  return (
    <div className={`table-chat${open ? " is-open" : ""}`}>
      {open ? (
        <>
          <div ref={feedRef} className="table-chat-feed" aria-live="polite">
            {visible.map((m) => {
              const mine = selfUserId != null && m.userId === selfUserId;
              const system = m.kind === "system";
              const time = formatChatTime(m.at);
              return (
                <div
                  key={m.id}
                  className={`table-chat-line${mine ? " is-mine" : ""}${system ? " is-system" : ""}`}
                >
                  {time ? (
                    <time className="table-chat-time" dateTime={m.at}>
                      {time}
                    </time>
                  ) : null}
                  {system ? (
                    <span className="table-chat-system">
                      {m.name} {m.text}
                    </span>
                  ) : (
                    <>
                      <span className="table-chat-name">{m.name}</span>
                      <span className="table-chat-text">{m.text}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <form className="table-chat-compose" onSubmit={submit}>
            <input
              ref={inputRef}
              className="table-chat-input"
              value={draft}
              maxLength={TABLE_CHAT_MAX_LEN}
              placeholder="Say something…"
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="submit"
              className="btn btn-sm"
              disabled={!draft.trim()}
            >
              Send
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setOpen(false);
                setDraft("");
              }}
            >
              Close
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="table-chat-peeks" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              {peeks.map((p) => (
                <motion.div
                  key={p.id}
                  className="table-chat-peek-item"
                  layout
                  initial={{ opacity: 0, x: -28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{
                    opacity: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                    x: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                    layout: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  <PeekLine msg={p.msg} selfUserId={selfUserId} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className="table-chat-pill"
            onClick={openChat}
            title="Open chat (/)"
          >
            Chat <kbd className="kbd">/</kbd>
            {unread > 0 && (
              <span className="table-chat-badge" aria-label={`${unread} new`}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
