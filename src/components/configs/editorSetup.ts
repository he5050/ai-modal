import { StreamLanguage, foldService } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import type { ConfigFormat } from "../../types";

export const configEditorTheme = EditorView.theme(
  {
    "&": {
      height: "520px",
      borderRadius: "1rem",
      border: "1px solid rgba(31, 41, 55, 1)",
      backgroundColor: "rgb(3 7 18)",
      overflow: "hidden",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "rgb(99 102 241)",
    },
    ".cm-scroller": {
      height: "100%",
      overflow: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: "rgba(75, 85, 99, 0.9) rgba(17, 24, 39, 0.9)",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    },
    ".cm-scroller::-webkit-scrollbar": {
      width: "10px",
      height: "10px",
    },
    ".cm-scroller::-webkit-scrollbar-track": {
      backgroundColor: "rgba(17, 24, 39, 0.92)",
    },
    ".cm-scroller::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(75, 85, 99, 0.9)",
      borderRadius: "999px",
      border: "2px solid rgba(17, 24, 39, 0.92)",
    },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": {
      backgroundColor: "rgba(99, 102, 241, 0.72)",
    },
    ".cm-scroller::-webkit-scrollbar-corner": {
      backgroundColor: "rgba(17, 24, 39, 0.92)",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(3 7 18)",
      borderRight: "1px solid rgba(31, 41, 55, 0.8)",
      color: "rgb(75 85 99)",
    },
    ".cm-content": {
      padding: "16px",
      caretColor: "#f8fafc",
      fontSize: "13px",
      lineHeight: "1.75",
      color: "rgb(229 231 235)",
    },
    ".cm-placeholder": {
      color: "rgb(75 85 99)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(129 140 248)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(99, 102, 241, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99, 102, 241, 0.28) !important",
    },
  },
  { dark: true },
);

const tomlLanguage = StreamLanguage.define(tomlMode);
const tomlSectionHeaderPattern = /^\[\[?.+\]\]?$/;
const tomlFoldExtension = foldService.of((state, lineStart) => {
  const currentLine = state.doc.lineAt(lineStart);
  const currentText = currentLine.text.trim();
  if (!tomlSectionHeaderPattern.test(currentText)) return null;

  let lastContentLine = currentLine.number;
  for (
    let lineNumber = currentLine.number + 1;
    lineNumber <= state.doc.lines;
    lineNumber += 1
  ) {
    const line = state.doc.line(lineNumber);
    const text = line.text.trim();
    if (tomlSectionHeaderPattern.test(text)) break;
    if (text.length > 0) lastContentLine = lineNumber;
  }

  if (lastContentLine === currentLine.number) return null;
  return {
    from: currentLine.to,
    to: state.doc.line(lastContentLine).to,
  };
});

export function getConfigLanguageExtensions(format: ConfigFormat) {
  switch (format) {
    case "env":
      return [];
    case "toml":
      return [tomlLanguage, tomlFoldExtension];
    case "yaml":
      return [yaml()];
    case "xml":
      return [xml()];
    case "json":
    default:
      return [json()];
  }
}
