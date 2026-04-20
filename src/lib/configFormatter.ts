import type { ConfigFormat } from "../types";

const SUPPORTED_CONFIG_FORMATS: ConfigFormat[] = [
  "json",
  "toml",
  "yaml",
  "xml",
];

export function isSupportedConfigFormat(format: ConfigFormat) {
  return SUPPORTED_CONFIG_FORMATS.includes(format);
}

export function getSupportedConfigFormatsLabel() {
  return SUPPORTED_CONFIG_FORMATS.map((format) => format.toUpperCase()).join(" / ");
}

export interface FormatConfigResult {
  formatted: string;
  normalizedPunctuation: boolean;
}

export async function formatConfigContent(
  content: string,
  format: ConfigFormat
) : Promise<FormatConfigResult> {
  const normalized = normalizeConfigSyntaxPunctuation(content, format);
  const source = normalized.content;

  switch (format) {
    case "json": {
      const [
        { default: prettier },
        babelPluginModule,
        estreePluginModule,
      ] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);
      return {
        formatted: await prettier.format(source, {
          parser: "json",
          plugins: [
            babelPluginModule.default ?? babelPluginModule,
            estreePluginModule.default ?? estreePluginModule,
          ],
        }),
        normalizedPunctuation: normalized.changed,
      };
    }
    case "toml": {
      const tomlModule = await import("smol-toml");
      return {
        formatted: tomlModule.stringify(tomlModule.parse(source)),
        normalizedPunctuation: normalized.changed,
      };
    }
    case "yaml": {
      const [{ default: prettier }, yamlPluginModule] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/yaml"),
      ]);
      return {
        formatted: await prettier.format(source, {
          parser: "yaml",
          plugins: [yamlPluginModule.default ?? yamlPluginModule],
        }),
        normalizedPunctuation: normalized.changed,
      };
    }
    case "xml":
      return {
        formatted: formatXmlContent(source),
        normalizedPunctuation: normalized.changed,
      };
    default:
      throw new Error(`Unsupported config format: ${String(format)}`);
  }
}

function formatXmlContent(content: string) {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new Error("当前环境不支持 XML 格式化");
  }

  const declarationMatch = content.match(/^\s*(<\?xml[\s\S]*?\?>)\s*/i);
  const declaration = declarationMatch?.[1] ?? null;
  const xmlBody = declaration ? content.slice(declarationMatch[0].length) : content;
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlBody, "application/xml");
  const parseError = documentNode.querySelector("parsererror");

  if (parseError) {
    throw new Error(parseError.textContent?.trim() || "XML 解析失败");
  }

  const root = documentNode.documentElement;
  if (!root) {
    throw new Error("XML 内容为空");
  }

  const lines: string[] = [];
  if (declaration) {
    lines.push(declaration.trim());
  }

  lines.push(serializeXmlNode(root, 0).trimEnd());
  return `${lines.join("\n")}\n`;
}

function serializeXmlNode(node: Node, indentLevel: number): string {
  const indent = "  ".repeat(indentLevel);
  const childIndentLevel = indentLevel + 1;

  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const element = node as Element;
      const tagName = element.tagName;
      const attributes = Array.from(element.attributes)
        .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
        .join("");
      const children = Array.from(element.childNodes).filter(
        (child) =>
          child.nodeType !== Node.TEXT_NODE || child.textContent?.trim().length
      );

      if (children.length === 0) {
        return `${indent}<${tagName}${attributes} />`;
      }

      const textOnly =
        children.length === 1 && children[0].nodeType === Node.TEXT_NODE;
      if (textOnly) {
        return `${indent}<${tagName}${attributes}>${escapeXmlText(
          children[0].textContent || ""
        )}</${tagName}>`;
      }

      const serializedChildren = children
        .map((child) => serializeXmlNode(child, childIndentLevel))
        .join("\n");

      return `${indent}<${tagName}${attributes}>\n${serializedChildren}\n${indent}</${tagName}>`;
    }
    case Node.TEXT_NODE:
      return `${indent}${escapeXmlText(node.textContent || "")}`;
    case Node.CDATA_SECTION_NODE:
      return `${indent}<![CDATA[${node.textContent || ""}]]>`;
    case Node.COMMENT_NODE:
      return `${indent}<!--${node.textContent || ""}-->`;
    default: {
      const serialized = new XMLSerializer().serializeToString(node).trim();
      return serialized ? `${indent}${serialized}` : "";
    }
  }
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeConfigSyntaxPunctuation(content: string, format: ConfigFormat) {
  switch (format) {
    case "json":
      return normalizeJsonSyntax(content);
    case "toml":
      return normalizeTomlSyntax(content);
    case "yaml":
      return normalizeYamlSyntax(content);
    case "xml":
      return normalizeXmlSyntax(content);
    default:
      return { content, changed: false };
  }
}

function normalizeJsonSyntax(content: string) {
  return normalizeOutsideQuotedText(content, {
    '"': true,
  }, (char) => {
    switch (char) {
      case "，":
      case "、":
        return ",";
      case "：":
        return ":";
      case "【":
        return "[";
      case "】":
        return "]";
      case "｛":
        return "{";
      case "｝":
        return "}";
      default:
        return char;
    }
  });
}

function normalizeTomlSyntax(content: string) {
  return normalizeOutsideQuotedText(content, {
    '"': true,
    "'": true,
  }, (char) => {
    switch (char) {
      case "，":
      case "、":
        return ",";
      case "＝":
        return "=";
      case "【":
        return "[";
      case "】":
        return "]";
      default:
        return char;
    }
  });
}

function normalizeYamlSyntax(content: string) {
  let normalized = "";
  let changed = false;
  let quote: '"' | "'" | null = null;
  let flowDepth = 0;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const previous = content[index - 1] ?? "";
    const next = content[index + 1] ?? "";

    if (quote) {
      normalized += char;
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      normalized += char;
      continue;
    }

    if (char === "[" || char === "{") {
      flowDepth += 1;
      normalized += char;
      continue;
    }

    if (char === "]" || char === "}") {
      flowDepth = Math.max(0, flowDepth - 1);
      normalized += char;
      continue;
    }

    let replacement = char;
    if (char === "【") replacement = "[";
    else if (char === "】") replacement = "]";
    else if (char === "｛") replacement = "{";
    else if (char === "｝") replacement = "}";
    else if ((char === "，" || char === "、") && flowDepth > 0) replacement = ",";
    else if (char === "：" && shouldNormalizeYamlColon(previous, next, flowDepth)) {
      replacement = ":";
    }

    if (replacement !== char) {
      changed = true;
    }
    normalized += replacement;
  }

  return { content: normalized, changed };
}

function normalizeXmlSyntax(content: string) {
  let normalized = "";
  let changed = false;
  let inTag = false;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (!inTag) {
      normalized += char;
      if (char === "<") {
        inTag = true;
      }
      continue;
    }

    if (quote) {
      normalized += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      normalized += char;
      continue;
    }

    if (char === ">") {
      inTag = false;
      normalized += char;
      continue;
    }

    let replacement = char;
    if (char === "＝") replacement = "=";
    else if (char === "？") replacement = "?";
    else if (char === "！") replacement = "!";
    else if (char === "／") replacement = "/";

    if (replacement !== char) {
      changed = true;
    }
    normalized += replacement;
  }

  return { content: normalized, changed };
}

function normalizeOutsideQuotedText(
  content: string,
  supportedQuotes: Partial<Record<'"' | "'", boolean>>,
  transform: (char: string) => string
) {
  let normalized = "";
  let changed = false;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const previous = content[index - 1] ?? "";

    if (quote) {
      normalized += char;
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if ((char === '"' || char === "'") && supportedQuotes[char]) {
      quote = char;
      normalized += char;
      continue;
    }

    const replacement = transform(char);
    if (replacement !== char) {
      changed = true;
    }
    normalized += replacement;
  }

  return { content: normalized, changed };
}

function shouldNormalizeYamlColon(previous: string, next: string, flowDepth: number) {
  if (flowDepth > 0) {
    return true;
  }

  const previousIsValue = previous.trim().length > 0;
  const nextIsSeparator =
    next === "" || next === " " || next === "\t" || next === "\r" || next === "\n" || next === "#";

  return previousIsValue && nextIsSeparator;
}
