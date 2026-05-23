import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Models } from "appwrite";
import {
  chatStorageErrorMessage,
  createCoachChat,
  deleteCoachChat,
  listCoachChats,
  updateCoachChat,
} from "./coachChats";
import { buildFlavourHistorySummary, getBstHour } from "./greeting";
import {
  caffeineFor,
  currency,
  humanDateTime,
  makeId,
  oneDecimal,
  spendFor,
  sugarFor,
  wholeNumber,
} from "./metrics";
import type { CoachChat, CoachMessage, LimitCheckResult, RedBullEntry, UserLimits } from "../types";
import { limitsSummaryForCoach } from "./userLimits";

type AuthUser = Models.User<Models.Preferences>;

type Dashboard = {
  todayCans: string;
  todayCaffeine: string;
  todaySugar: string;
  favouriteFlavour: string;
  currentStreak: string;
  totalSpend: string;
};

const OLLAMA_MODEL = "deepseek-v4-pro:cloud";
const OLLAMA_PROXY_URL = import.meta.env.VITE_OLLAMA_PROXY_URL?.trim() || "/api/ollama-chat";

type OllamaStreamChunk = { error?: string; message?: { content?: string; thinking?: string } };

export type CoachSession = ReturnType<typeof useCoachSession>;

export function useCoachSession(
  user: AuthUser,
  dashboard: Dashboard,
  entries: RedBullEntry[],
  userLimits: UserLimits = {},
  limitCheck?: LimitCheckResult,
) {
  const [chats, setChats] = useState<CoachChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [savedChatIds, setSavedChatIds] = useState<Set<string>>(() => new Set());
  const [storageStatus, setStorageStatus] = useState("loading");
  const [storageReady, setStorageReady] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const queuedPromptRef = useRef<string | null>(null);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId]);
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat]);
  const visibleMessages = useMemo(() => messages.filter((message) => message.id !== "coach-welcome"), [messages]);

  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      if (!user.$id) return;
      setStorageStatus("loading");
      setError("");
      try {
        const savedChats = await listCoachChats(user.$id);
        if (cancelled) return;
        const initialChats = savedChats.length ? savedChats : [buildNewCoachChat(user, dashboard)];
        setChats(initialChats);
        setSavedChatIds(new Set(savedChats.map((chat) => chat.id)));
        setActiveChatId(initialChats[0].id);
        setStorageStatus(savedChats.length ? `${savedChats.length} synced` : "ready");
        setStorageReady(true);
      } catch (caught) {
        if (cancelled) return;
        setError(chatStorageErrorMessage(caught));
        const fallback = buildNewCoachChat(user, dashboard);
        setChats([fallback]);
        setActiveChatId(fallback.id);
        setStorageStatus("local only");
        setStorageReady(true);
      }
    }

    void loadChats();
    return () => {
      cancelled = true;
    };
  }, [user.$id]);

  const upsertChatState = useCallback((chat: CoachChat) => {
    setChats((current) => {
      const exists = current.some((item) => item.id === chat.id);
      return exists ? current.map((item) => (item.id === chat.id ? chat : item)) : [chat, ...current];
    });
  }, []);

  const patchAssistantMessage = useCallback((chatId: string, messageId: string, patch: Partial<CoachMessage>) => {
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: new Date().toISOString(),
              messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            }
          : chat,
      ),
    );
  }, []);

  const withAssistantMessage = useCallback((chat: CoachChat, messageId: string, patch: Partial<CoachMessage>): CoachChat => {
    return {
      ...chat,
      updatedAt: new Date().toISOString(),
      messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    };
  }, []);

  const persistChat = useCallback(
    async (chat: CoachChat) => {
      try {
        const saved = savedChatIds.has(chat.id)
          ? await updateCoachChat(user.$id, chat)
          : await createCoachChat(user.$id, chat);
        setSavedChatIds((current) => new Set(current).add(saved.id));
        upsertChatState(saved);
        setStorageStatus("synced");
        return true;
      } catch (caught) {
        setStorageStatus("save pending");
        setError(chatStorageErrorMessage(caught));
        return false;
      }
    },
    [savedChatIds, upsertChatState, user.$id],
  );

  const sendPrompt = useCallback(
    async (prompt: string, chatOverride?: CoachChat | null) => {
      const trimmed = prompt.trim();
      if (!trimmed || busy || !storageReady || !user.$id) return false;

      const currentChat = chatOverride ?? activeChat ?? buildNewCoachChat(user, dashboard);
      const userMessage: CoachMessage = { id: makeId(), role: "user", content: trimmed };
      const assistantId = makeId();
      const assistantMessage: CoachMessage = { id: assistantId, role: "assistant", content: "", thinking: "", pending: true };
      const conversation = [...currentChat.messages, userMessage];
      const draftChat: CoachChat = {
        ...currentChat,
        title: titleForChat(currentChat.title, trimmed),
        messages: [...conversation, assistantMessage],
        updatedAt: new Date().toISOString(),
      };

      upsertChatState(draftChat);
      setActiveChatId(draftChat.id);
      setInput("");
      setBusy(true);
      setError("");

      let streamedContent = "";
      let streamedThinking = "";
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const requestMessages: Array<{ role: string; content: string; thinking?: string }> = [
          { role: "system", content: buildCoachSystemPrompt(user, dashboard, entries, userLimits, limitCheck) },
          ...conversation
            .filter((message) => message.content.trim().length > 0)
            .map((message) => ({
              role: message.role,
              content: message.content,
              ...(message.thinking ? { thinking: message.thinking } : {}),
            })),
        ];

        const response = await fetch(OLLAMA_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: requestMessages,
            stream: true,
            think: true,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(parseCoachError(detail, response.status));
        }
        if (!response.body) {
          throw new Error("streaming response was empty.");
        }

        await readOllamaStream(response.body, (chunk) => {
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.message?.thinking) streamedThinking += chunk.message.thinking;
          if (chunk.message?.content) streamedContent += chunk.message.content.toLocaleLowerCase();

          patchAssistantMessage(draftChat.id, assistantId, {
            content: streamedContent,
            thinking: streamedThinking,
            pending: !streamedContent,
          });
        });

        const finalChat = withAssistantMessage(draftChat, assistantId, {
          content: streamedContent || "no answer returned.",
          thinking: streamedThinking,
          pending: false,
        });
        upsertChatState(finalChat);
        void persistChat(finalChat);
        return true;
      } catch (caught) {
        const aborted = abortController.signal.aborted;
        const message = caught instanceof Error ? caught.message : "coach request failed.";
        const finalChat = withAssistantMessage(draftChat, assistantId, {
          content: aborted ? streamedContent || "stopped thinking." : `coach unavailable: ${message}`.toLocaleLowerCase(),
          thinking: streamedThinking,
          pending: false,
          stopped: aborted,
        });
        upsertChatState(finalChat);
        void persistChat(finalChat);
        if (!aborted) setError(message);
        return false;
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [activeChat, busy, dashboard, entries, patchAssistantMessage, persistChat, storageReady, upsertChatState, user, withAssistantMessage],
  );

  const queuePrompt = useCallback((prompt: string) => {
    queuedPromptRef.current = prompt;
  }, []);

  useEffect(() => {
    const prompt = queuedPromptRef.current;
    if (!storageReady || !prompt || busy) return;
    queuedPromptRef.current = null;
    void sendPrompt(prompt);
  }, [storageReady, busy, sendPrompt]);

  const startNewChat = useCallback(() => {
    const chat = buildNewCoachChat(user, dashboard);
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput("");
    setError("");
  }, [dashboard, user]);

  const removeChat = useCallback(
    async (chatId: string) => {
      if (busy) return;
      try {
        if (savedChatIds.has(chatId)) await deleteCoachChat(chatId);
        setSavedChatIds((current) => {
          const next = new Set(current);
          next.delete(chatId);
          return next;
        });
        setChats((current) => {
          const next = current.filter((chat) => chat.id !== chatId);
          const fallback = buildNewCoachChat(user, dashboard);
          setActiveChatId(next[0]?.id ?? fallback.id);
          return next.length ? next : [fallback];
        });
      } catch (caught) {
        setError(chatStorageErrorMessage(caught));
      }
    },
    [busy, dashboard, savedChatIds, user],
  );

  const stopThinking = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    activeChatId,
    busy,
    chats,
    error,
    input,
    queuePrompt,
    removeChat,
    sendPrompt,
    setActiveChatId,
    setError,
    setInput,
    startNewChat,
    stopThinking,
    storageReady,
    storageStatus,
    visibleMessages,
  };
}

function firstName(user: AuthUser) {
  const fallback = user.email?.split("@")[0] ?? "there";
  const value = (user.name || fallback).trim();
  return value.split(/\s+/)[0] || "there";
}

function buildNewCoachChat(user: AuthUser, dashboard: Dashboard): CoachChat {
  const now = new Date().toISOString();
  const favourite = dashboard.favouriteFlavour === "None yet" ? "your patterns" : dashboard.favouriteFlavour;
  return {
    id: makeId(),
    userId: user.$id,
    title: "today",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: "coach-welcome",
        role: "assistant",
        content: `hey ${firstName(user).toLocaleLowerCase()}, ${dashboard.todayCans} cans logged today. ask about ${favourite}, caffeine pace, or spend.`,
      },
    ],
  };
}

function titleForChat(currentTitle: string, prompt: string) {
  if (currentTitle !== "today" && currentTitle !== "new chat") return currentTitle;
  const cleaned = prompt.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}...` : cleaned || "today";
}

function buildCoachSystemPrompt(
  user: AuthUser,
  dashboard: Dashboard,
  entries: RedBullEntry[],
  userLimits: UserLimits,
  limitCheck?: LimitCheckResult,
) {
  const recent = entries
    .slice(0, 12)
    .map(
      (entry) =>
        `- ${humanDateTime(entry.dateTime)}: ${entry.cans} can(s), ${entry.flavour}, ${entry.sizeMl}ml, ${currency.format(spendFor(entry))}, ${wholeNumber.format(caffeineFor(entry))}mg caffeine, ${oneDecimal.format(sugarFor(entry))}g sugar`,
    )
    .join("\n");

  return [
    "You are an upbeat Red Bull intake coach inside a tracking app.",
    "Respond entirely in lower case.",
    "Give concise, practical suggestions based only on the logged data provided.",
    "When asked about favourite flavour historically, use the flavour history breakdown below.",
    "Do not give medical advice.",
    `User: ${user.name || user.email || "Appwrite user"}`,
    `Current time (BST): ${getBstHour()}:00.`,
    `Today: ${dashboard.todayCans} cans, ${dashboard.todayCaffeine} caffeine, ${dashboard.todaySugar} sugar.`,
    `Personal limits: ${limitsSummaryForCoach(userLimits, limitCheck ?? { violations: [], projectedCans: 0, projectedSpend: 0, todayCans: 0, todaySpend: 0, pastStopTime: false })}`,
    `All-time favourite: ${dashboard.favouriteFlavour}. Streak: ${dashboard.currentStreak} day(s). Spend: ${dashboard.totalSpend}.`,
    `Flavour history:\n${buildFlavourHistorySummary(entries)}`,
    `Recent entries:\n${recent || "No entries logged yet."}`,
  ].join("\n");
}

function parseCoachError(detail: string, status: number) {
  const trimmed = detail.trim();
  if (trimmed.startsWith("<") || /nginx|405 not allowed/i.test(trimmed)) {
    return `coach api unavailable (${status}). run npm run dev with OLLAMA_API_KEY set, or proxy POST /api/ollama-chat on your host.`;
  }
  return trimmed || `request failed (${status}).`;
}

async function readOllamaStream(body: ReadableStream<Uint8Array>, onChunk: (chunk: OllamaStreamChunk) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parseOllamaLine(line);
      if (chunk) onChunk(chunk);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const chunk = parseOllamaLine(buffer);
    if (chunk) onChunk(chunk);
  }
}

function parseOllamaLine(line: string): OllamaStreamChunk | null {
  const trimmed = line.trim().replace(/^data:\s*/, "");
  if (!trimmed || trimmed === "[DONE]") return null;
  try {
    return JSON.parse(trimmed) as OllamaStreamChunk;
  } catch {
    return null;
  }
}

export { OLLAMA_MODEL };
