import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Menu, MessageSquarePlus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router";
import { chatStarters, type AiProposal, type ChatBlock } from "@sharry/shared";
import { cn } from "cn";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../components/ui/sheet.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { ChatBlocks } from "./chat-blocks.tsx";

export const lastChatStorageKey = "sharry.lastChat";

export function chatToOpen(chatIds: string[], storedId: string | null, fresh: boolean): string | null {
  if (fresh || chatIds.length === 0) return null;
  if (storedId && chatIds.includes(storedId)) return storedId;
  return chatIds[0] ?? null;
}

function isNewChat(state: unknown): boolean {
  return Boolean(state && typeof state === "object" && "newChat" in state && state.newChat === true);
}

type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  proposal: AiProposal | null;
  blocks?: ChatBlock[] | null;
};

export function ChatPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [submittingForm, setSubmittingForm] = useState<string | null>(null);
  const skipLoad = useRef<string | null>(null);
  const fresh = isNewChat(location.state);

  useEffect(() => {
    void api<{ available: boolean }>("/api/ai/status")
      .then((status) => setAvailable(status.available))
      .catch((caught: unknown) => toastCaught(caught, t("Could not load chat")));
    void api<{ chats: ChatSummary[] }>("/api/chats")
      .then((result) => setChats(result.chats))
      .catch((caught: unknown) => toastCaught(caught, t("Could not load chat")))
      .finally(() => setChatsLoaded(true));
  }, [t]);

  useEffect(() => {
    if (id) {
      localStorage.setItem(lastChatStorageKey, id);
      return;
    }
    if (!chatsLoaded) return;
    const next = chatToOpen(
      chats.map((chat) => chat.id),
      localStorage.getItem(lastChatStorageKey),
      fresh,
    );
    if (next) void navigate(`/chat/${next}`, { replace: true });
  }, [id, chats, chatsLoaded, fresh, navigate]);

  useEffect(() => {
    if (!id) {
      setMessages([]);
      return;
    }
    if (skipLoad.current === id) {
      skipLoad.current = null;
      return;
    }
    void api<{ messages: ChatMessage[] }>(`/api/chats/${id}`)
      .then((result) => setMessages(result.messages))
      .catch((caught: unknown) => toastCaught(caught, t("Could not load chat")));
  }, [id, t]);

  async function startChat(): Promise<string> {
    const created = await api<ChatSummary>("/api/chats", { method: "POST" });
    setChats((current) => [created, ...current.filter((chat) => chat.id !== created.id)]);
    return created.id;
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || available !== true || sending) return;
    setSending(true);
    setDraft("");
    let chatId = id;
    try {
      if (!chatId) {
        chatId = await startChat();
        skipLoad.current = chatId;
        await navigate(`/chat/${chatId}`);
      }
      setMessages((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: "user", content: text, proposal: null, blocks: null },
      ]);
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId && chat.title === "New chat" ? { ...chat, title: text.slice(0, 80) } : chat,
        ),
      );
      await streamReply(chatId, text, setMessages);
    } catch (caught) {
      toastCaught(caught, t("Could not send the message"));
    } finally {
      setSending(false);
    }
  }

  function openNewChat() {
    setListOpen(false);
    void navigate("/chat", { state: { newChat: true } });
  }

  async function removeChat(chatId: string) {
    try {
      await api(`/api/chats/${chatId}`, { method: "DELETE" });
      const remaining = chats.filter((chat) => chat.id !== chatId);
      setChats(remaining);
      if (localStorage.getItem(lastChatStorageKey) === chatId) localStorage.removeItem(lastChatStorageKey);
      if (id !== chatId) return;
      const next = remaining[0];
      if (next) await navigate(`/chat/${next.id}`, { replace: true });
      else await navigate("/chat", { replace: true, state: { newChat: true } });
    } catch (caught) {
      toastCaught(caught, t("Could not delete the chat"));
    }
  }

  async function submitForm(formId: string, body: Record<string, unknown>) {
    if (!id || submittingForm) return;
    setSubmittingForm(formId);
    try {
      const result = await api<{ message: ChatMessage; report: ChatMessage | null }>(
        `/api/chats/${id}/forms/${formId}/submit`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setMessages((current) => {
        const next = current.map((message) =>
          message.blocks?.some((block) => block.type === "form" && block.id === formId) ? result.message : message,
        );
        return result.report ? [...next, result.report] : next;
      });
    } catch (caught) {
      toastCaught(caught, t("Could not update the card"));
    } finally {
      setSubmittingForm(null);
    }
  }

  async function settle(proposalId: string, action: "confirm" | "dismiss") {
    if (!id) return;
    try {
      const result = await api<{ proposal: AiProposal }>(`/api/chats/${id}/proposals/${proposalId}/${action}`, {
        method: "POST",
      });
      setMessages((current) =>
        current.map((message) =>
          message.proposal?.id === proposalId ? { ...message, proposal: result.proposal } : message,
        ),
      );
    } catch (caught) {
      toastCaught(caught, t("Could not update the card"));
    }
  }

  return (
    <section className="grid items-stretch gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-w-0 md:sticky md:top-7 md:flex md:h-[calc(100svh-3.5rem)] md:max-h-[calc(100svh-3.5rem)] md:flex-col md:self-start md:border-r md:border-border md:pr-4">
        <ChatList
          chats={chats}
          tone="page"
          onNew={openNewChat}
          onPick={() => setListOpen(false)}
          onDelete={(chatId) => void removeChat(chatId)}
        />
      </aside>
      <ChatConversation
        available={available}
        messages={messages}
        draft={draft}
        sending={sending}
        menu={
          <div className="md:hidden">
            <Sheet open={listOpen} onOpenChange={setListOpen}>
              <SheetTrigger render={<Button variant="outline" size="sm" type="button" />}>
                <Menu /> {t("Chats")}
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground sm:max-w-xs"
              >
                <SheetTitle className="pr-8 text-sidebar-foreground">{t("Chats")}</SheetTitle>
                <ChatList
                  chats={chats}
                  tone="sidebar"
                  onNew={openNewChat}
                  onPick={() => setListOpen(false)}
                  onDelete={(chatId) => void removeChat(chatId)}
                />
              </SheetContent>
            </Sheet>
          </div>
        }
        onDraft={setDraft}
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        onStarter={(prompt) => void send(prompt)}
        submittingForm={submittingForm}
        onConfirm={(proposalId) => void settle(proposalId, "confirm")}
        onDismiss={(proposalId) => void settle(proposalId, "dismiss")}
        onSubmitForm={(formId, body) => void submitForm(formId, body)}
      />
    </section>
  );
}

function ChatList({
  chats,
  tone,
  onNew,
  onPick,
  onDelete,
}: {
  chats: ChatSummary[];
  tone: "page" | "sidebar";
  onNew: () => void;
  onPick: () => void;
  onDelete: (chatId: string) => void;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const sidebar = tone === "sidebar";
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
      <div className="grid min-h-0 w-full min-w-0 flex-1 content-start gap-1 overflow-x-hidden overflow-y-auto">
        {chats.map((chat) => {
          const active = pathname === `/chat/${chat.id}`;
          return (
            <div
              key={chat.id}
              className={cn(
                "flex min-w-0 items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-sm",
                sidebar
                  ? "border-sidebar-border text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                  : "hover:bg-primary/10",
                active &&
                  (sidebar ? "bg-sidebar-accent font-medium text-white" : "bg-primary hover:bg-primary font-medium text-primary-foreground"),
              )}
            >
              <NavLink to={`/chat/${chat.id}`} onClick={onPick} className="min-w-0 flex-1 truncate">
                {chat.title === "New chat" ? t("New chat") : chat.title}
              </NavLink>
              <button
                type="button"
                className="shrink-0 rounded-md p-1"
                aria-label={t("Delete chat")}
                onClick={() => onDelete(chat.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <Button
        className={cn(
          "w-full min-w-0 shrink",
          sidebar && "border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
        )}
        type="button"
        variant="outline"
        onClick={onNew}
      >
        <MessageSquarePlus /> {t("New chat")}
      </Button>
    </div>
  );
}

export function ChatConversation({
  available,
  messages,
  draft,
  sending,
  submittingForm,
  menu,
  onDraft,
  onSubmit,
  onStarter,
  onConfirm,
  onDismiss,
  onSubmitForm,
}: {
  available: boolean | null;
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  submittingForm: string | null;
  menu?: ReactNode;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStarter: (prompt: string) => void;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
  onSubmitForm: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLTextAreaElement>(null);
  const visible = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const showStarters = available === true && visible.length === 0;
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = "0px";
    const next = Math.min(Math.max(node.scrollHeight, 40), 40 + 24 * 7);
    node.style.height = `${next}px`;
  }, [draft]);
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (available !== true || sending || !draft.trim()) return;
    event.currentTarget.form?.requestSubmit();
  }
  return (
    <div className="flex min-h-[calc(100svh-5.5rem)] min-w-0 flex-col md:min-h-[calc(100svh-3.5rem)]">
      <div className="grid content-start gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-medium tracking-tight">{t("Chat")}</h1>
          {menu}
        </div>
        {available === false ? (
          <Card>
            <CardContent className="grid gap-1">
              <h2 className="text-lg font-medium">{t("AI not available")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("An administrator has not saved a provider, model, and API key.")}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {showStarters ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {chatStarters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="rounded-xl bg-card px-3 py-3 text-left text-sm font-medium ring-1 ring-foreground/10 hover:bg-muted"
                onClick={() => onStarter(t(starter.prompt))}
              >
                {t(starter.label)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 pb-4">
          {visible.map((message) => (
            <article key={message.id} className={cn("grid", message.role === "user" && "justify-items-end")}>
              {message.role === "user" ? (
                <div className="max-w-[40rem] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ) : (
                <AssistantReply
                  message={message}
                  submittingForm={submittingForm}
                  onConfirm={onConfirm}
                  onDismiss={onDismiss}
                  onSubmitForm={onSubmitForm}
                />
              )}
            </article>
          ))}
        </div>
      </div>
      <form className="sticky bottom-0 z-10 mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-border bg-background pt-3" onSubmit={onSubmit}>
        <Textarea
          ref={box}
          rows={1}
          aria-label={t("Message")}
          placeholder="Ask about links, campaigns, or analytics"
          value={draft}
          disabled={available !== true || sending}
          className="min-h-10 resize-none overflow-y-auto py-2"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
        />
        <Button type="submit" disabled={available !== true || sending || !draft.trim()}>
          {sending ? t("Sending…") : t("Send")}
        </Button>
      </form>
    </div>
  );
}

function AssistantReply({
  message,
  submittingForm,
  onConfirm,
  onDismiss,
  onSubmitForm,
}: {
  message: ChatMessage;
  submittingForm: string | null;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
  onSubmitForm: (formId: string, body: Record<string, unknown>) => void;
}) {
  const hasBlocks = Boolean(message.blocks && message.blocks.length > 0);
  if (!message.content && !hasBlocks && !message.proposal) return null;
  return (
    <Card className="w-full max-w-[40rem]">
      <CardContent className="grid gap-3">
        {message.content ? <AssistantText text={message.content} /> : null}
        {hasBlocks ? (
          <ChatBlocks blocks={message.blocks ?? []} submitting={submittingForm} onSubmit={onSubmitForm} />
        ) : null}
        {message.proposal ? (
          <ProposalCard proposal={message.proposal} onConfirm={onConfirm} onDismiss={onDismiss} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function AssistantText({ text }: { text: string }) {
  return (
    <div className="grid gap-2 [&_a]:underline [&_h1]:text-lg [&_h1]:font-medium [&_h2]:text-base [&_h2]:font-medium [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-4 [&_table]:w-full [&_td]:border-b [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("/") && !href.startsWith("//")) return <Link to={href}>{children}</Link>;
            if (href?.startsWith("https://") || href?.startsWith("http://")) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children as ReactNode}
                </a>
              );
            }
            return <span>{children}</span>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function ProposalCard({
  proposal,
  onConfirm,
  onDismiss,
}: {
  proposal: AiProposal;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
}) {
  const { t } = useI18n();
  const destination = typeof proposal.args.destinationUrl === "string" ? proposal.args.destinationUrl : "";
  const name = typeof proposal.args.name === "string" ? proposal.args.name : "";
  const title = typeof proposal.args.title === "string" ? proposal.args.title : "";
  const slug = typeof proposal.args.slug === "string" ? proposal.args.slug : "";
  const openLabel = proposal.tool === "propose_link" ? "Open link" : "Open campaign";
  return (
    <div className="grid gap-2">
      <h2 className="font-medium">{proposal.tool === "propose_link" ? t("Short link") : t("Campaign")}</h2>
      {destination ? <p className="text-sm break-all">{destination}</p> : null}
      {name ? <p className="text-sm">{name}</p> : null}
      {title ? <p className="text-sm text-muted-foreground">{title}</p> : null}
      {slug ? <p className="text-sm text-muted-foreground">{slug}</p> : null}
      {proposal.status === "pending" ? (
        <p className="text-sm text-muted-foreground">{t("Nothing is created until you confirm.")}</p>
      ) : null}
      {proposal.status === "confirmed" && proposal.result?.shortUrl ? (
        <p className="text-sm break-all">{proposal.result.shortUrl}</p>
      ) : null}
      {proposal.status === "confirmed" && proposal.result?.path ? (
        <Link className="text-sm underline" to={proposal.result.path}>
          {t(openLabel)}
        </Link>
      ) : null}
      {proposal.status === "failed" && proposal.result?.error ? (
        <p className="text-sm text-destructive">{t(proposal.result.error)}</p>
      ) : null}
      {proposal.status === "dismissed" ? <p className="text-sm text-muted-foreground">{t("Dismissed")}</p> : null}
      {proposal.result?.variants?.map((variant) => (
        <p key={variant.name} className="text-sm text-muted-foreground">
          {variant.error ? `${variant.name}: ${t(variant.error)}` : variant.name}
        </p>
      ))}
      {proposal.status === "pending" ? (
        <div className="flex gap-2">
          <Button type="button" onClick={() => onConfirm(proposal.id)}>
            {t("Confirm")}
          </Button>
          <Button type="button" variant="outline" onClick={() => onDismiss(proposal.id)}>
            {t("Dismiss")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

async function streamReply(
  chatId: string,
  content: string,
  setMessages: (update: (current: ChatMessage[]) => ChatMessage[]) => void,
): Promise<void> {
  const response = await fetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(response.status, payload.error ?? "Request failed", payload.code);
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  const pendingId = `pending-${Date.now()}`;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) applySse(chunk, pendingId, setMessages);
  }
  if (buffer.trim()) applySse(buffer, pendingId, setMessages);
}

function applySse(
  chunk: string,
  pendingId: string,
  setMessages: (update: (current: ChatMessage[]) => ChatMessage[]) => void,
) {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  const payload = JSON.parse(data) as {
    text?: string;
    proposal?: AiProposal;
    block?: ChatBlock;
    messageId?: string;
    error?: string;
  };
  if (event === "error") throw new ApiError(502, payload.error ?? "Request failed");
  if (event === "text" && payload.text) {
    setMessages((current) => appendAssistant(current, pendingId, payload.text ?? ""));
  }
  if (event === "block" && payload.block) {
    setMessages((current) => attachBlock(current, pendingId, payload.block as ChatBlock));
  }
  if (event === "proposal" && payload.proposal) {
    setMessages((current) => attachProposal(current, pendingId, payload.proposal as AiProposal));
  }
  if (event === "done" && payload.messageId) {
    setMessages((current) =>
      current.map((message) => (message.id === pendingId ? { ...message, id: payload.messageId as string } : message)),
    );
  }
}

function appendAssistant(current: ChatMessage[], pendingId: string, text: string): ChatMessage[] {
  const index = current.findIndex((message) => message.id === pendingId);
  if (index === -1) {
    return [...current, { id: pendingId, role: "assistant", content: text, proposal: null, blocks: [] }];
  }
  const next = [...current];
  const message = next[index];
  if (!message) return current;
  next[index] = { ...message, content: message.content + text };
  return next;
}

function attachBlock(current: ChatMessage[], pendingId: string, block: ChatBlock): ChatMessage[] {
  const index = current.findIndex((message) => message.id === pendingId);
  if (index === -1) return [...current, { id: pendingId, role: "assistant", content: "", proposal: null, blocks: [block] }];
  const next = [...current];
  const message = next[index];
  if (!message) return current;
  next[index] = { ...message, blocks: [...(message.blocks ?? []), block] };
  return next;
}

function attachProposal(current: ChatMessage[], pendingId: string, proposal: AiProposal): ChatMessage[] {
  const index = current.findIndex((message) => message.id === pendingId);
  if (index === -1) return [...current, { id: pendingId, role: "assistant", content: "", proposal }];
  const next = [...current];
  const message = next[index];
  if (!message) return current;
  next[index] = { ...message, proposal };
  return next;
}
