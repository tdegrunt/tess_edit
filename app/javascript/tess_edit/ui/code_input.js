// A code field without an editor library: a textarea whose text is
// transparent, over a copy of the text with HTML (or XML), CSS, YAML and
// Liquid colored.
// Both wrap the same way and scroll together, so the caret and selection of
// the textarea line up with the colored text. Tab indents, Shift+Tab
// outdents, and Enter keeps the line's indentation.

import { h } from "tess_edit/ui/dom"

const INDENT = "  "
// Shared by the textarea and the colored copy, so they lay out the same
const BOX = "m-0 w-full rounded-md border px-2 py-1.5 font-mono text-xs leading-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] [tab-size:2] [scrollbar-gutter:stable]"

const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/
const COLORS = {
  liquid: "text-purple-700",
  comment: "text-gray-400 dark:text-gray-500 italic",
  tag: "text-blue-700 dark:text-blue-300",
  attribute: "text-amber-700 dark:text-amber-400",
  string: "text-green-700 dark:text-green-400",
  property: "text-blue-700 dark:text-blue-300",
  at: "text-purple-700",
  number: "text-amber-700 dark:text-amber-400"
}

function escape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function span(kind, html) {
  return `<span class="${COLORS[kind]}">${html}</span>`
}

// Colors the parts of text that match one of the patterns ([kind, regexp]),
// in order of preference, and passes the rest to plain(text)
function tokenize(text, patterns, plain = escape) {
  const source = patterns.map(([, pattern]) => `(${pattern.source})`).join("|")
  const regexp = new RegExp(source, "g")
  let html = ""
  let last = 0
  for (const match of text.matchAll(regexp)) {
    html += plain(text.slice(last, match.index))
    const index = match.slice(1).findIndex((group) => group !== undefined)
    const [kind, , inner] = patterns[index]
    html += inner ? inner(match[0]) : span(kind, escape(match[0]))
    last = match.index + match[0].length
  }
  return html + plain(text.slice(last))
}

const liquidIn = (text) => tokenize(text, [["liquid", LIQUID]])

function htmlTag(tag) {
  return tokenize(tag, [
    ["liquid", LIQUID],
    ["string", /"[^"]*"|'[^']*'/, (string) => span("string", liquidIn(string))],
    ["tag", /^<\/?[\w-]+|\/?>$/],
    ["attribute", /[\w:@-]+(?=\s*=)/]
  ])
}

export function highlightHtml(text) {
  return tokenize(text, [
    ["liquid", LIQUID],
    ["comment", /<!--[\s\S]*?-->/],
    // Liquid and quoted values may hold a ">", so they're skipped as a whole
    ["tag", /<\/?[a-zA-Z](?:\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|"[^"]*"|'[^']*'|[^>"'])*>?/, htmlTag]
  ])
}

export function highlightCss(text) {
  return tokenize(text, [
    ["liquid", LIQUID],
    ["comment", /\/\*[\s\S]*?\*\//],
    ["string", /"[^"\n]*"|'[^'\n]*'/],
    ["at", /@[\w-]+/],
    ["property", /[\w-]+(?=\s*:[^:{};]*[;}])/],
    ["number", /#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|pt)?\b/]
  ])
}

export function highlightYaml(text) {
  return tokenize(text, [
    ["liquid", LIQUID],
    ["comment", /(?:^|(?<=\s))#[^\n]*/],
    ["string", /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/, (string) => span("string", liquidIn(string))],
    ["property", /[A-Za-z_$][\w $.-]*(?=:(?:\s|$))/],
    ["number", /\b(?:-?\d+(?:\.\d+)?|true|false|null)\b/]
  ])
}

const HIGHLIGHT = { html: highlightHtml, xml: highlightHtml, css: highlightCss, yaml: highlightYaml }

// Replaces the selection, keeping the textarea's own undo where the browser allows
function insert(textarea, text) {
  if (!document.execCommand?.("insertText", false, text)) textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end")
}

function onKeydown(event) {
  const textarea = event.target
  const { value, selectionStart: start, selectionEnd: end } = textarea
  if (event.key === "Tab" && !event.altKey && !event.metaKey && !event.ctrlKey) {
    event.preventDefault()
    const lineStart = value.lastIndexOf("\n", start - 1) + 1
    if (!event.shiftKey && start === end) return insert(textarea, INDENT)
    // Every line of the selection, indented or outdented
    textarea.setSelectionRange(lineStart, end)
    const lines = value.slice(lineStart, end).split("\n")
    const changed = lines.map((line) => (event.shiftKey ? line.replace(new RegExp(`^ {1,${INDENT.length}}|^\\t`), "") : INDENT + line)).join("\n")
    insert(textarea, changed)
    textarea.setSelectionRange(lineStart, lineStart + changed.length)
  } else if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.isComposing) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1
    const indent = value.slice(lineStart, start).match(/^[ \t]*/)[0]
    if (!indent) return
    event.preventDefault()
    insert(textarea, `\n${indent}`)
  }
}

// value, language ("html", "xml", "css" or "yaml"), oninput(value); class sizes the field
export function codeInput({ value = "", language = "html", oninput, class: className = "min-h-32", readOnly = false }) {
  const highlight = HIGHLIGHT[language] || escape
  const colored = h("pre", { "aria-hidden": "true", class: `${BOX} pointer-events-none absolute inset-0 h-full overflow-hidden border-transparent bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200` })
  const textarea = h("textarea", {
    class: `${BOX} ${className} relative block resize-y overflow-y-auto border-gray-300 dark:border-gray-600 bg-transparent text-transparent caret-gray-900 dark:caret-gray-100 outline-none selection:bg-blue-500/25 focus:border-blue-500 focus:ring-1 focus:ring-blue-500`,
    spellcheck: false,
    autocapitalize: "off",
    autocomplete: "off",
    readOnly,
    value,
    onkeydown: onKeydown,
    onscroll: () => (colored.scrollTop = textarea.scrollTop),
    oninput: () => {
      paint()
      oninput?.(textarea.value)
    }
  })
  // A trailing newline needs a character after it to take up a line
  const paint = () => {
    colored.innerHTML = `${highlight(textarea.value)}\n `
    colored.scrollTop = textarea.scrollTop
  }
  paint()
  const field = h("div", { class: "relative" }, colored, textarea)
  field.textarea = textarea
  return field
}
