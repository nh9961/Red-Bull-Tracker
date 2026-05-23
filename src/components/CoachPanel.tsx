import { Brain, ChevronRight, Loader2, Plus, Send, Sparkles, Square, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { getBstHour } from "../lib/greeting";
import type { CoachSession } from "../lib/useCoachSession";
import { OLLAMA_MODEL } from "../lib/useCoachSession";
import type { CoachMessage } from "../types";

type CoachPanelProps = {
  session: CoachSession;
  mode: "compact" | "full";
  dashboard: {
    todayCans: string;
    todayCaffeine: string;
    favouriteFlavour: string;
  };
  userInitials: string;
  onExpand?: () => void;
};

const QUICK_PROMPTS = [
  "what's my favourite flavour historically?",
  "how should i pace caffeine for the rest of the day?",
  "suggest a lower-sugar swap",
];

export function CoachPanel({ session, mode, dashboard, userInitials, onExpand }: CoachPanelProps) {
  const {
    busy,
    chats,
    error,
    input,
    activeChatId,
    removeChat,
    sendPrompt,
    setActiveChatId,
    setInput,
    startNewChat,
    stopThinking,
    storageReady,
    storageStatus,
    visibleMessages,
  } = session;

  const displayMessages = mode === "compact" ? visibleMessages.slice(-4) : visibleMessages;
  const compact = mode === "compact";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendPrompt(input);
  }

  if (!storageReady) {
    return (
      <section className="coach-panel glass-panel p-5">
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          loading coach...
        </div>
      </section>
    );
  }

  return (
    <section className={`coach-panel glass-panel ${compact ? "coach-panel-compact" : "coach-panel-full"}`}>
      <header className="coach-panel-header">
        <div className="coach-panel-title">
          <div className="coach-panel-icon">
            <Brain size={18} aria-hidden="true" />
          </div>
          <div>
            <p className="coach-panel-kicker">coach</p>
            <h3 className="coach-panel-heading">
              {dashboard.todayCans} cans today · {dashboard.favouriteFlavour}
            </h3>
          </div>
        </div>
        <div className="coach-panel-meta">
          <span className="coach-status-pill">
            <span className={`coach-status-dot ${busy ? "coach-status-dot-busy" : ""}`} />
            {busy ? "thinking" : storageStatus}
          </span>
          {!compact && <span className="coach-model-tag">{OLLAMA_MODEL}</span>}
          {compact && onExpand && (
            <button className="coach-expand-button" type="button" onClick={onExpand}>
              open
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {!compact && chats.length > 1 && (
        <div className="coach-thread-strip">
          {chats.map((chat) => (
            <div key={chat.id} className={`coach-thread-chip ${chat.id === activeChatId ? "coach-thread-chip-active" : ""}`}>
              <button type="button" onClick={() => setActiveChatId(chat.id)}>
                {chat.title}
              </button>
              <button type="button" aria-label={`delete ${chat.title}`} onClick={() => void removeChat(chat.id)} disabled={busy}>
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button className="coach-thread-new" type="button" onClick={startNewChat} disabled={busy}>
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="coach-panel-context">
        <span>{dashboard.todayCaffeine} caffeine</span>
        <span>bst {getBstHour()}:00</span>
      </div>

      <div className={`coach-panel-feed ${compact ? "coach-panel-feed-compact" : ""}`} aria-live="polite">
        {!displayMessages.length ? (
          <div className="coach-panel-empty">
            <Sparkles size={20} aria-hidden="true" />
            <p>ask about pace, flavours, or spend — coach reads your live log.</p>
            <div className="coach-quick-grid">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} className="suggestion-chip" type="button" disabled={busy} onClick={() => void sendPrompt(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          displayMessages.map((message) => (
            <CoachLine key={message.id} message={message} userInitials={userInitials} />
          ))
        )}
      </div>

      {error && <p className="coach-panel-error">{error}</p>}

      <form className="coach-panel-composer" onSubmit={submit}>
        {!compact && (
          <button className="icon-button" type="button" onClick={startNewChat} disabled={busy} aria-label="new chat">
            <Plus size={16} aria-hidden="true" />
          </button>
        )}
        <input
          className="field-control coach-panel-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="ask coach anything..."
          disabled={busy}
        />
        {busy ? (
          <button className="icon-button" type="button" onClick={stopThinking} aria-label="stop">
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button className="primary-button coach-panel-send" type="submit" disabled={!input.trim()} aria-label="send">
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  );
}

function CoachLine({ message, userInitials }: { message: CoachMessage; userInitials: string }) {
  const isAssistant = message.role === "assistant";
  const isThinking = isAssistant && message.pending && !message.content.trim();

  return (
    <article className={`coach-line ${isAssistant ? "coach-line-assistant" : "coach-line-user"}`}>
      <span className="coach-line-avatar">{isAssistant ? <Brain size={14} /> : userInitials}</span>
      <div className="coach-line-body">
        {isThinking && <ThinkingPill stopped={message.stopped} />}
        {message.content ? <p>{message.content}</p> : !isThinking ? <span className="coach-line-typing">...</span> : null}
        {isAssistant && !message.pending && message.thinking?.trim() ? (
          <details className="thinking-details">
            <summary>reasoning</summary>
            <pre className="thinking-trace">{message.thinking}</pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function ThinkingPill({ stopped }: { stopped?: boolean }) {
  return (
    <div className={`thinking-pill ${stopped ? "thinking-pill-stopped" : ""}`} aria-live="polite">
      <div className="thinking-pill-track">
        <span className="thinking-pill-shimmer" aria-hidden="true" />
        <span className="thinking-pill-label">{stopped ? "stopped" : "Thinking..."}</span>
        <span className="thinking-pill-chevron" aria-hidden="true">›››</span>
      </div>
    </div>
  );
}
