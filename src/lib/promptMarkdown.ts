function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownInline(value: string) {
  let rendered = escapeHtml(value);
  rendered = rendered.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-indigo-300 underline decoration-indigo-400/60 underline-offset-4">$1</a>',
  );
  rendered = rendered.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-white/10 px-1.5 py-0.5 text-[0.92em] text-amber-200">$1</code>',
  );
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return rendered;
}

export function renderMarkdownToHtml(markdownText: string) {
  const lines = markdownText.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLines: string[] = [];
  let codeFence: string | null = null;
  let blockquoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(
      `<p class="mb-4 leading-8 text-gray-100">${renderMarkdownInline(
        paragraphLines.join(" "),
      )}</p>`,
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) return;
    html.push(
      `<blockquote class="mb-4 border-l-2 border-indigo-400/50 pl-4 text-gray-300">${blockquoteLines
        .map(
          (line) =>
            `<p class="leading-7">${renderMarkdownInline(line)}</p>`,
        )
        .join("")}</blockquote>`,
    );
    blockquoteLines = [];
  };

  const flushCodeBlock = () => {
    if (codeFence == null) return;
    html.push(
      `<pre class="mb-4 overflow-x-auto rounded-2xl border border-gray-800 bg-black/40 p-4 text-sm leading-7 text-emerald-100"><code>${escapeHtml(
        codeLines.join("\n"),
      )}</code></pre>`,
    );
    codeLines = [];
    codeFence = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushBlockquote();
      if (codeFence == null) {
        codeFence = trimmed;
      } else {
        flushCodeBlock();
      }
      continue;
    }

    if (codeFence != null) {
      codeLines.push(line);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      const sizeClass =
        level === 1
          ? "text-3xl"
          : level === 2
            ? "text-2xl"
            : level === 3
              ? "text-xl"
              : "text-lg";
      html.push(
        `<h${level} class="mb-3 mt-6 font-semibold tracking-tight text-white ${sizeClass}">${renderMarkdownInline(
          headingMatch[2],
        )}</h${level}>`,
      );
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        html.push(
          '<ul class="mb-4 list-disc space-y-2 pl-6 leading-7 text-gray-100">',
        );
      }
      html.push(`<li>${renderMarkdownInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        html.push(
          '<ol class="mb-4 list-decimal space-y-2 pl-6 leading-7 text-gray-100">',
        );
      }
      html.push(`<li>${renderMarkdownInline(olMatch[1])}</li>`);
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    flushList();
    flushBlockquote();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushBlockquote();
  flushCodeBlock();

  return html.join("");
}
