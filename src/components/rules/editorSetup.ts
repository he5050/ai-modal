import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";

function buildHeadingDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const headingMatch = /^(#{1,6})\s+/.exec(line.text);
    if (!headingMatch) continue;
    const level = Math.min(headingMatch[1].length, 3);
    builder.add(
      line.from,
      line.from,
      Decoration.line({ class: `cm-md-heading cm-md-heading-${level}` }),
    );
  }
  return builder.finish();
}

export const headingHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildHeadingDecorations(update.state);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

export const markdownEditorTheme = EditorView.theme(
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
    ".cm-line": {
      padding: "0 2px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(129 140 248)",
    },
    ".cm-md-heading": {
      fontWeight: "700",
    },
    ".cm-md-heading-1": {
      color: "#f8fafc",
      fontSize: "18px",
      lineHeight: "2",
      paddingTop: "6px",
    },
    ".cm-md-heading-2": {
      color: "#dbeafe",
      fontSize: "16px",
      lineHeight: "1.9",
      paddingTop: "4px",
    },
    ".cm-md-heading-3": {
      color: "#bfdbfe",
      fontSize: "14px",
      lineHeight: "1.8",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(99, 102, 241, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99, 102, 241, 0.28) !important",
    },
    ".cm-tooltip": {
      border: "1px solid rgba(55, 65, 81, 1)",
      backgroundColor: "rgb(17 24 39)",
      color: "rgb(229 231 235)",
    },
  },
  { dark: true },
);

export const editorExtensions = [markdown(), headingHighlightPlugin, markdownEditorTheme];
