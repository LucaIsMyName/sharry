import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import typescript from "shiki/langs/typescript.mjs";
import githubDark from "shiki/themes/github-dark.mjs";

export type HighlightToken = {
  content: string;
  color?: string;
};

let loading: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  loading ??= createHighlighterCore({
    themes: [githubDark],
    langs: [typescript],
    engine: createJavaScriptRegexEngine(),
  });
  return loading;
}

export async function highlightTypeScript(source: string): Promise<HighlightToken[][]> {
  const highlighter = await loadHighlighter();
  const { tokens } = highlighter.codeToTokens(source, {
    lang: "typescript",
    theme: "github-dark",
  });
  return tokens.map((line) =>
    line.map((token) => ({ content: token.content, color: token.color })),
  );
}
