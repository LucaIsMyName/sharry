export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && document.hasFocus()) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // The clipboard can reject the write. Fall back to a selection.
    }
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  if (!copied) throw new Error("Could not copy the short URL");
}
