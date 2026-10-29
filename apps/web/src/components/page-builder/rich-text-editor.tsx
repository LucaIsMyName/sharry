import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Unlink,
} from "lucide-react";
import { cleanRichText, isSafeHref } from "@sharry/shared";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog.tsx";
import { Field } from "../ui/field.tsx";
import { Input } from "../ui/input.tsx";

/** TipTap with only the formatting the page renderer keeps. The saved HTML goes through the same cleaner as the API. */
export function RichTextEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const { t } = useI18n();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: {
        "aria-label": t(label),
        class: "rich-text min-h-28 px-3 py-2 text-base outline-none md:text-sm",
      },
    },
    onUpdate: ({ editor: current }) => onChange(cleanRichText(current.isEmpty ? "" : current.getHTML())),
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (cleanRichText(editor.getHTML()) !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-md border border-input bg-white focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
      {editor ? <Toolbar editor={editor} /> : <div className="min-h-9 border-b border-border" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      left: current.isActive({ textAlign: "left" }),
      center: current.isActive({ textAlign: "center" }),
      right: current.isActive({ textAlign: "right" }),
    }),
  });
  const chain = () => editor.chain().focus();
  const [linkHref, setLinkHref] = useState<string | null>(null);

  function saveLink(href: string) {
    setLinkHref(null);
    if (!href) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href }).run();
  }

  return (
    <div role="toolbar" aria-label={t("Formatting")} className="flex min-h-9 flex-wrap items-center gap-0.5 border-b border-border px-1 py-0.5">
      <Tool label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </Tool>
      <Tool label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </Tool>
      <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </Tool>
      <Divider />
      <Tool label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </Tool>
      <Tool label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </Tool>
      <Tool label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </Tool>
      <Tool label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </Tool>
      <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </Tool>
      <Tool label="Link" active={state.link} onClick={() => setLinkHref(String(editor.getAttributes("link").href ?? ""))}>
        <Link2 />
      </Tool>
      <Divider />
      <Tool label="Align left" active={state.left} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeft />
      </Tool>
      <Tool label="Align center" active={state.center} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenter />
      </Tool>
      <Tool label="Align right" active={state.right} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRight />
      </Tool>
      <Tool label="Clear formatting" active={false} onClick={() => chain().unsetAllMarks().clearNodes().unsetTextAlign().run()}>
        <RemoveFormatting />
      </Tool>
      <LinkDialog
        href={linkHref}
        onSave={saveLink}
        onCancel={() => {
          setLinkHref(null);
          chain().run();
        }}
      />
    </div>
  );
}

function LinkDialog({ href, onSave, onCancel }: { href: string | null; onSave: (href: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (href === null) return;
    setDraft(href);
    setError("");
  }, [href]);

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const next = draft.trim();
    if (next && !isSafeHref(next)) {
      setError("Use a web address, mailto:, tel:, or a path that starts with /");
      return;
    }
    onSave(next);
  }

  return (
    <Dialog
      open={href !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">{t(href ? "Edit link" : "Add link")}</DialogTitle>
            <DialogDescription>{t("Leave the address empty to remove the link.")}</DialogDescription>
          </DialogHeader>
          <Field label="Link address" error={error}>
            <Input
              value={draft}
              placeholder="https://"
              autoFocus
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
            />
          </Field>
          <DialogFooter>
            {href ? (
              <Button type="button" variant="outline" className="sm:mr-auto" onClick={() => onSave("")}>
                <Unlink /> {t("Remove link")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("Cancel")}
            </Button>
            <Button type="submit">{t("Save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Tool({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t(label)}
      title={t(label)}
      aria-pressed={active}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-11 [&>svg]:size-4 pointer-coarse:[&>svg]:size-5",
        active && "bg-muted text-foreground",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}
