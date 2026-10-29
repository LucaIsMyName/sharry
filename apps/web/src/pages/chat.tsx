import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Menu, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, NavLink, useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { chatStarters, type AiProposal, type ChatBlock } from "@sharry/shared";
import { cn } from "cn";
import { ApiError, api } from "../api.ts";
import { RelativeTime } from "../components/relative-time.tsx";
import { useI18n } from "../i18n/index.tsx";
import { PageTitle } from "../components/page-title.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { SubNav } from "../components/sub-nav.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../components/ui/sheet.tsx";
import { ChatListSkeleton, ChatThreadSkeleton, WritingSkeleton } from "../components/ui/skeleton.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { ChatBlocks, CopyableUrl } from "./chat-blocks.tsx";

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

const starterHints: Record<(typeof chatStarters)[number]["id"], string> = {
  link: "Destination, optional title, slug, UTM, and a QR code.",
  campaign: "A name, a link, and an optional variant.",
  analytics: "All links or one link, on a date range.",
};

type PendingProposal = { id: string; action: "confirm" | "dismiss" };

function isAbort(caught: unknown): boolean {
  return caught instanceof Error && caught.name === "AbortError";
}

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
  const { admin } = useOutletContext<{ admin: boolean }>() ?? { admin: false };
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesFor, setMessagesFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failedSend, setFailedSend] = useState<{ id: string; content: string } | null>(null);
  const [submittingForm, setSubmittingForm] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const skipLoad = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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
      setMessagesFor(null);
      return;
    }
    if (skipLoad.current === id) {
      skipLoad.current = null;
      setMessagesFor(id);
      return;
    }
    let cancelled = false;
    setMessages([]);
    setMessagesFor(null);
    void api<{ messages: ChatMessage[] }>(`/api/chats/${id}`)
      .then((result) => {
        if (cancelled) return;
        setMessages(result.messages);
        setMessagesFor(id);
      })
      .catch((caught: unknown) => {
        if (!cancelled) toastCaught(caught, t("Could not load chat"));
      })
      .finally(() => {
        if (!cancelled) setMessagesFor(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  async function renameChat(chatId: string, title: string) {
    try {
      const updated = await api<ChatSummary>(`/api/chats/${chatId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setChats((items) => items.map((chat) => (chat.id === chatId ? { ...chat, title: updated.title } : chat)));
    } catch (caught) {
      toastCaught(caught, t("Could not rename the chat"));
      throw caught;
    }
  }

  async function startChat(): Promise<string> {
    const created = await api<ChatSummary>("/api/chats", { method: "POST" });
    setChats((current) => [created, ...current.filter((chat) => chat.id !== created.id)]);
    return created.id;
  }

  function stopReply() {
    abortRef.current?.abort();
  }

  async function send(content: string, retryId?: string) {
    const text = content.trim();
    if (!text || available !== true || sending) return;
    setSending(true);
    if (!retryId) setDraft("");
    setFailedSend(null);
    let chatId = id;
    const userId = retryId ?? `user-${Date.now()}`;
    const pendingId = `pending-${Date.now()}`;
    const controller = new AbortController();
    abortRef.current = controller;
    let posted = Boolean(retryId);
    try {
      if (!chatId) {
        chatId = await startChat();
        skipLoad.current = chatId;
        await navigate(`/chat/${chatId}`);
      }
      if (!retryId) {
        setMessages((current) => [
          ...current,
          { id: userId, role: "user", content: text, proposal: null, blocks: null },
        ]);
        posted = true;
      }
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId && chat.title === "New chat" ? { ...chat, title: text.slice(0, 80) } : chat,
        ),
      );
      await streamReply(chatId, text, setMessages, controller.signal, pendingId);
    } catch (caught) {
      if (!isAbort(caught)) {
        setMessages((current) => current.filter((message) => message.id !== pendingId));
        if (posted) setFailedSend({ id: userId, content: text });
        toastCaught(caught, t("Could not send the message"));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
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
    if (!id || pendingProposal) return;
    setPendingProposal({ id: proposalId, action });
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
    } finally {
      setPendingProposal(null);
    }
  }

  const current = chats.find((chat) => chat.id === id);
  const heading = current
    ? current.title === "New chat"
      ? t("New chat")
      : current.title
    : t(!id && (fresh || (chatsLoaded && chats.length === 0)) ? "New chat" : "Chat");
  const nextId =
    !id && chatsLoaded ? chatToOpen(chats.map((chat) => chat.id), localStorage.getItem(lastChatStorageKey), fresh) : null;
  const loadingThread =
    !fresh && (!chatsLoaded || Boolean(nextId) || Boolean(id && messagesFor !== id) || (available === null && !id));

  return (
    <>
    <PageTitle title={current && current.title !== "New chat" ? current.title : heading} literal={Boolean(current && current.title !== "New chat")} />
    <SubNav label={t("Chats")}>
      
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetTrigger render={<Button variant="outline" className={"bg-white"} size="sm" type="button" />}>
          <Menu /> {t("Chats")}
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground sm:max-w-xs"
        >
          <SheetTitle className="pr-8 text-sidebar-foreground">{t("Chats")}</SheetTitle>
          <ChatList
            chats={chats}
            loading={!chatsLoaded}
            tone="sidebar"
            onNew={openNewChat}
            onPick={() => setListOpen(false)}
            onDelete={setDeleteId}
          />
        </SheetContent>
      </Sheet>
      <Button variant="default" size="sm" type="button" onClick={openNewChat}>
        <MessageSquarePlus /> {t("New chat")}
      </Button>
    </SubNav>
    <section className="grid h-full min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden h-full min-h-0 flex-col border-r border-border p-0 md:flex">
        <ChatList
          chats={chats}
          loading={!chatsLoaded}
          tone="page"
          onNew={openNewChat}
          onPick={() => setListOpen(false)}
          onDelete={setDeleteId}
        />
      </aside>
      <div className="flex h-full min-h-0 flex-col px-5 py-4 md:px-7">
        <ChatConversation
          title={heading}
          admin={admin}
          available={available}
          loading={loadingThread}
          messages={messages}
          draft={draft}
          sending={sending}
          failedId={failedSend?.id ?? null}
          pendingProposal={pendingProposal}
          onDraft={setDraft}
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          onStarter={(prompt) => void send(prompt)}
          onStop={stopReply}
          onRetry={(content, messageId) => void send(content, messageId)}
          name={current?.title}
          onRename={id && current ? (title) => renameChat(current.id, title) : undefined}
          submittingForm={submittingForm}
          onConfirm={(proposalId) => void settle(proposalId, "confirm")}
          onDismiss={(proposalId) => void settle(proposalId, "dismiss")}
          onSubmitForm={(formId, body) => void submitForm(formId, body)}
        />
      </div>
    </section>
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete chat"
        description="The transcript is removed."
        confirmLabel="Delete chat"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={() => {
          const chatId = deleteId;
          setDeleteId(null);
          if (chatId) void removeChat(chatId);
        }}
      />
    </>
  );
}

export function ChatList({
  chats,
  loading,
  tone,
  onNew,
  onPick,
  onDelete,
}: {
  chats: ChatSummary[];
  loading: boolean;
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
      <Button
        className={cn(
          "w-auto min-w-0 shrink-0 mx-1.5 mt-1.5",
          sidebar && "border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        type="button"
        variant="default"
        onClick={onNew}
      >
        <MessageSquarePlus /> {t("New chat")}
      </Button>
      <div className="grid min-h-0 w-full min-w-0 flex-1 content-start overflow-x-hidden overflow-y-auto overscroll-contain">
        {loading ? <ChatListSkeleton /> : null}
        {loading
          ? null
          : chats.map((chat) => {
              const active = pathname === `/chat/${chat.id}`;
              return (
                <div
                  key={chat.id}
                  data-slot="chat-row"
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-1 border-b px-2 py-2.5 text-sm",
                    sidebar
                      ? "border-sidebar-border text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      : "border-border hover:bg-muted",
                    active && (sidebar ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "bg-muted font-medium"),
                  )}
                >
                  <NavLink to={`/chat/${chat.id}`} onClick={onPick} className="min-w-0 flex-1">
                    <span className="block truncate">{chat.title === "New chat" ? t("New chat") : chat.title}</span>
                    <span className={cn("block truncate text-xs", sidebar ? "text-sidebar-foreground/60" : "text-muted-foreground")}>
                      <RelativeTime value={chat.updatedAt} />
                    </span>
                  </NavLink>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn("shrink-0", sidebar && "hover:bg-sidebar hover:text-sidebar-foreground")}
                    aria-label={t("Delete chat")}
                    onClick={() => onDelete(chat.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
      </div>
    </div>
  );
}

export function ChatConversation({
  title,
  admin = false,
  available,
  loading = false,
  messages,
  draft,
  sending,
  failedId = null,
  pendingProposal = null,
  submittingForm,
  onDraft,
  onSubmit,
  onStarter,
  onStop,
  onRetry,
  onConfirm,
  onDismiss,
  onSubmitForm,
  name,
  onRename,
}: {
  title?: string;
  name?: string;
  admin?: boolean;
  available: boolean | null;
  loading?: boolean;
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  failedId?: string | null;
  pendingProposal?: PendingProposal | null;
  submittingForm: string | null;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStarter: (prompt: string) => void;
  onStop?: () => void;
  onRetry?: (content: string, messageId: string) => void;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
  onSubmitForm: (formId: string, body: Record<string, unknown>) => void;
  onRename?: (title: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const wasSending = useRef(false);
  const [away, setAway] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameBox = useRef<HTMLInputElement>(null);
  const skipName = useRef(false);
  const visible = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const showStarters = !loading && available === true && visible.length === 0;
  const writing =
    sending &&
    !visible.some(
      (message) =>
        message.role === "assistant" &&
        message.id.startsWith("pending-") &&
        (message.content || message.blocks?.length || message.proposal),
    );
  useEffect(() => {
    if (!renaming) return;
    const node = nameBox.current;
    if (!node) return;
    node.focus();
    node.select();
  }, [renaming]);
  async function commitName() {
    if (skipName.current) {
      skipName.current = false;
      return;
    }
    const next = nameDraft.trim();
    if (!next || next === (name ?? title) || !onRename) {
      setRenaming(false);
      return;
    }
    try {
      await onRename(next);
      setRenaming(false);
    } catch {
      nameBox.current?.focus();
    }
  }
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = "0px";
    const next = Math.min(Math.max(node.scrollHeight, 40), 40 + 24 * 7);
    node.style.height = `${next}px`;
  }, [draft]);
  useEffect(() => {
    if (wasSending.current && !sending) box.current?.focus();
    wasSending.current = sending;
    if (sending) {
      pinned.current = true;
      setAway(false);
    }
  }, [sending]);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !pinned.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, sending, loading]);
  function onScroll() {
    const node = scroller.current;
    if (!node) return;
    const near = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    pinned.current = near;
    setAway(!near);
  }
  function jump() {
    const node = scroller.current;
    if (!node) return;
    pinned.current = true;
    setAway(false);
    node.scrollTop = node.scrollHeight;
  }
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (available !== true || sending || !draft.trim()) return;
    event.currentTarget.form?.requestSubmit();
  }
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className="h-full overflow-y-auto"
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={onScroll}
        >
          <div className="mx-auto grid w-full max-w-3xl content-start gap-4 pb-4">
            <div className="min-w-0">
              {renaming ? (
                <input
                  ref={nameBox}
                  aria-label={t("Chat name")}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 font-heading text-2xl font-medium tracking-tight"
                  value={nameDraft}
                  maxLength={80}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipName.current = true;
                      setRenaming(false);
                    }
                  }}
                />
              ) : (
                <div className="flex min-w-0 items-center gap-1 pb-2 border-b">
                  <h1 className="min-w-0 truncate font-heading text-2xl font-medium tracking-tight">{title ?? t("Chat")}</h1>
                  {onRename && name ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("Rename chat")}
                      onClick={() => {
                        setNameDraft(name);
                        setRenaming(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                </div>
              )}
              {showStarters ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t("Ask about links, campaigns, or the last 30 days")}
                </p>
              ) : null}
            </div>
            {loading ? <ChatThreadSkeleton /> : null}
            {!loading && available === false ? (
              <div className="grid justify-items-start gap-3">
                <div className="grid gap-1">
                  <h2 className="text-lg font-medium">{t("AI not available")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("An administrator has not saved a provider, model, and API key.")}
                  </p>
                </div>
                {admin ? (
                  <Link className={buttonVariants({ variant: "outline", size: "sm" })} to="/admin/settings">
                    {t("Open settings")}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {showStarters ? (
              <ul className="grid border-t border-border">
                {chatStarters.map((starter) => (
                  <li key={starter.id} className="border-b border-border">
                    <button
                      type="button"
                      aria-label={t(starter.label)}
                      className="block w-full px-2 py-3 text-left text-sm font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => onStarter(t(starter.prompt))}
                    >
                      <span className="block">{t(starter.label)}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">{t(starterHints[starter.id])}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!loading ? (
              <div className="grid gap-3">
                {visible.map((message) => (
                  <article key={message.id} className={cn("grid", message.role === "user" && "justify-items-end")}>
                    {message.role === "user" ? (
                      <div className="grid justify-items-end gap-2">
                        <div className="max-w-full rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                        {failedId === message.id ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => onRetry?.(message.content, message.id)}>
                            {t("Retry")}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <AssistantReply
                        message={message}
                        submittingForm={submittingForm}
                        pendingProposal={pendingProposal}
                        aiAvailable={available === true}
                        onConfirm={onConfirm}
                        onDismiss={onDismiss}
                        onSubmitForm={onSubmitForm}
                      />
                    )}
                  </article>
                ))}
                {writing ? <WritingSkeleton /> : null}
              </div>
            ) : null}
          </div>
        </div>
        {away && visible.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute bottom-3 left-1/2 -translate-x-1/2"
            onClick={jump}
          >
            {t("Jump to latest")}
          </Button>
        ) : null}
      </div>
      <form className="border-t border-border bg-background pt-3" onSubmit={onSubmit}>
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Textarea
          ref={box}
          rows={1}
          aria-label={t("Message")}
          placeholder={t("Ask about links, campaigns, or analytics")}
          value={draft}
          disabled={available !== true || sending}
          className="min-h-10 resize-none overflow-y-auto py-2"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
        />
        {sending ? (
          <Button type="button" variant="outline" onClick={onStop}>
            {t("Stop")}
          </Button>
        ) : (
          <Button type="submit" disabled={available !== true || !draft.trim()}>
            {t("Send")}
          </Button>
        )}
        </div>
      </form>
    </div>
  );
}

function AssistantReply({
  message,
  submittingForm,
  pendingProposal,
  aiAvailable,
  onConfirm,
  onDismiss,
  onSubmitForm,
}: {
  message: ChatMessage;
  submittingForm: string | null;
  pendingProposal: PendingProposal | null;
  aiAvailable: boolean;
  onConfirm: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
  onSubmitForm: (formId: string, body: Record<string, unknown>) => void;
}) {
  const hasBlocks = Boolean(message.blocks && message.blocks.length > 0);
  if (!message.content && !hasBlocks && !message.proposal) return null;
  const pending = message.proposal && pendingProposal?.id === message.proposal.id ? pendingProposal.action : null;
  return (
    <div className="grid w-full max-w-full gap-3 text-sm">
      {message.content ? <AssistantText text={message.content} /> : null}
      {hasBlocks ? (
        <ChatBlocks
          blocks={message.blocks ?? []}
          reportText={message.content}
          submitting={submittingForm}
          aiAvailable={aiAvailable}
          onSubmit={onSubmitForm}
        />
      ) : null}
      {message.proposal ? (
        <ProposalCard proposal={message.proposal} pending={pending} onConfirm={onConfirm} onDismiss={onDismiss} />
      ) : null}
    </div>
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
  pending = null,
  onConfirm,
  onDismiss,
}: {
  proposal: AiProposal;
  pending?: "confirm" | "dismiss" | null;
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
        <CopyableUrl url={proposal.result.shortUrl} />
      ) : null}
      {proposal.status === "confirmed" && proposal.result?.path ? (
        <Link className={buttonVariants({ size: "sm" })} to={proposal.result.path}>
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
          <Button type="button" disabled={pending !== null} onClick={() => onConfirm(proposal.id)}>
            {pending === "confirm" ? t("Confirming…") : t("Confirm")}
          </Button>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => onDismiss(proposal.id)}>
            {pending === "dismiss" ? t("Dismissing…") : t("Dismiss")}
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
  signal: AbortSignal,
  pendingId: string,
): Promise<void> {
  const response = await fetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(response.status, payload.error ?? "Request failed", payload.code);
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
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
