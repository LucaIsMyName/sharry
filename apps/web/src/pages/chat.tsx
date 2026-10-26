import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Link, NavLink, useNavigate, useParams } from "react-router";
import { chatStarters, type AiProposal } from "@sharry/shared";
import { cn } from "cn";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { toastCaught } from "../components/ui/toast.tsx";

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
};

export function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const skipLoad = useRef<string | null>(null);

  useEffect(() => {
    void api<{ available: boolean }>("/api/ai/status")
      .then((status) => setAvailable(status.available))
      .catch((caught: unknown) => toastCaught(caught, t("Could not load chat")));
    void api<{ chats: ChatSummary[] }>("/api/chats")
      .then((result) => setChats(result.chats))
      .catch((caught: unknown) => toastCaught(caught, t("Could not load chat")));
  }, [t]);

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
        { id: `user-${Date.now()}`, role: "user", content: text, proposal: null },
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

  async function removeChat(chatId: string) {
    try {
      await api(`/api/chats/${chatId}`, { method: "DELETE" });
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      if (id === chatId) await navigate("/chat");
    } catch (caught) {
      toastCaught(caught, t("Could not delete the chat"));
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
    <section className="grid items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-2">
        <Button type="button" variant="outline" onClick={() => void navigate("/chat")}>
          <MessageSquarePlus /> {t("New chat")}
        </Button>
        <div className="grid gap-1">
          {chats.map((chat) => (
            <div key={chat.id} className="flex items-center gap-1">
              <NavLink
                to={`/chat/${chat.id}`}
                className={({ isActive }) =>
                  cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    isActive && "bg-muted font-medium",
                  )
                }
              >
                {chat.title === "New chat" ? t("New chat") : chat.title}
              </NavLink>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Delete chat")}
                onClick={() => void removeChat(chat.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>
      <ChatConversation
        available={available}
        messages={messages}
        draft={draft}
        sending={sending}
        onDraft={setDraft}
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        onStarter={(prompt) => void send(prompt)}
        onConfirm={(proposalId) => void settle(proposalId, "confirm")}
        onDismiss={(proposalId) => void settle(proposalId, "dismiss")}
      />
    </section>
  );
}

export function ChatConversation({
  available,
  messages,
  draft,
  sending,
  onDraft,
  onSubmit,
  onStarter,
  onConfirm,
  onDismiss,
}: {
  available: boolean | null;
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStarter: (prompt: string) => void;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
}) {
  const { t } = useI18n();
  const visible = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const showStarters = available === true && visible.length === 0;
  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="font-heading text-2xl font-medium tracking-tight">{t("Chat")}</h1>
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
      <div className="grid gap-3">
        {visible.map((message) => (
          <article key={message.id} className={cn("grid gap-2", message.role === "user" && "justify-items-end")}>
            {message.content ? (
              <div
                className={cn(
                  "max-w-[40rem] rounded-xl px-3 py-2 text-sm",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {message.role === "assistant" ? <AssistantText text={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
              </div>
            ) : null}
            {message.proposal ? (
              <ProposalCard proposal={message.proposal} onConfirm={onConfirm} onDismiss={onDismiss} />
            ) : null}
          </article>
        ))}
      </div>
      <form className="grid gap-2" onSubmit={onSubmit}>
        <Textarea
          aria-label={t("Message")}
          placeholder="Ask about links, campaigns, or analytics"
          value={draft}
          disabled={available !== true || sending}
          onChange={(event) => onDraft(event.target.value)}
        />
        <Button type="submit" disabled={available !== true || sending || !draft.trim()}>
          {sending ? t("Sending…") : t("Send")}
        </Button>
      </form>
    </div>
  );
}

function AssistantText({ text }: { text: string }) {
  return (
    <div className="grid gap-2 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4">
      <ReactMarkdown
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
    <Card className="w-full max-w-[40rem]">
      <CardContent className="grid gap-2">
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
      </CardContent>
    </Card>
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
  const payload = JSON.parse(data) as { text?: string; proposal?: AiProposal; messageId?: string; error?: string };
  if (event === "error") throw new ApiError(502, payload.error ?? "Request failed");
  if (event === "text" && payload.text) {
    setMessages((current) => appendAssistant(current, pendingId, payload.text ?? ""));
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
    return [...current, { id: pendingId, role: "assistant", content: text, proposal: null }];
  }
  const next = [...current];
  const message = next[index];
  if (!message) return current;
  next[index] = { ...message, content: message.content + text };
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
