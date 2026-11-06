// Turns Tiptap/ProseMirror JSON into email-friendly HTML. Liquid ({{ … }} and
// {% … %}) is copied verbatim so quotes and comparison operators keep working.

const LIQUID = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g

export function escapeText(text) {
  return String(text ?? "")
    .split(LIQUID)
    .map((part, i) => (i % 2 ? part : part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("")
}

export function escapeAttribute(value) {
  return String(value ?? "")
    .split(LIQUID)
    .map((part, i) => (i % 2 ? part.replace(/"/g, "'") : part.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("")
}

function style(declarations) {
  const css = Object.entries(declarations)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => `${name}:${value}`)
    .join(";")
  return css ? ` style="${escapeAttribute(css)}"` : ""
}

function wrapMark(mark, html) {
  const attrs = mark.attrs || {}
  switch (mark.type) {
    case "bold":
      return `<strong>${html}</strong>`
    case "italic":
      return `<em>${html}</em>`
    case "underline":
      return `<u>${html}</u>`
    case "strike":
      return `<s>${html}</s>`
    case "code":
      return `<code>${html}</code>`
    case "link": {
      const target = attrs.target ? ` target="${escapeAttribute(attrs.target)}"` : ""
      return `<a href="${escapeAttribute(attrs.href || "#")}"${target} style="color:inherit;">${html}</a>`
    }
    case "textStyle": {
      const css = style({ color: attrs.color, "font-size": attrs.fontSize, "font-family": attrs.fontFamily, "background-color": attrs.backgroundColor })
      return css ? `<span${css}>${html}</span>` : html
    }
    case "highlight":
      return `<mark${style({ "background-color": attrs.color })}>${html}</mark>`
    default:
      return html
  }
}

function inline(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "<br>"
      if (node.type !== "text") return render(node)
      // Apply marks so the link ends up outermost, matching how editors nest them.
      const marks = [...(node.marks || [])].sort((a, b) => (a.type === "link") - (b.type === "link"))
      return marks.reduce((html, mark) => wrapMark(mark, html), escapeText(node.text))
    })
    .join("")
}

function blockStyle(node, base = {}) {
  return style({ ...base, "text-align": node.attrs?.textAlign && node.attrs.textAlign !== "left" ? node.attrs.textAlign : undefined })
}

const HEADING_SIZES = { 1: "2em", 2: "1.5em", 3: "1.25em", 4: "1.1em" }

function render(node) {
  switch (node.type) {
    case "doc":
      return (node.content || []).map(render).join("")
    case "paragraph": {
      const body = inline(node.content)
      return `<p${blockStyle(node, { margin: "0" })}>${body || "<br>"}</p>`
    }
    case "heading": {
      const level = node.attrs?.level || 1
      return `<h${level}${blockStyle(node, { margin: "0", "font-size": HEADING_SIZES[level], "line-height": "1.25" })}>${inline(node.content)}</h${level}>`
    }
    case "bulletList":
      return `<ul style="margin:0;padding-left:1.5em;">${(node.content || []).map(render).join("")}</ul>`
    case "orderedList": {
      const start = node.attrs?.start && node.attrs.start !== 1 ? ` start="${node.attrs.start}"` : ""
      return `<ol${start} style="margin:0;padding-left:1.5em;">${(node.content || []).map(render).join("")}</ol>`
    }
    case "listItem":
      return `<li>${(node.content || []).map((child) => (child.type === "paragraph" ? inline(child.content) : render(child))).join("")}</li>`
    case "blockquote":
      return `<blockquote style="margin:0;padding-left:1em;border-left:3px solid #e5e7eb;">${(node.content || []).map(render).join("")}</blockquote>`
    case "horizontalRule":
      return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:0.5em 0;">'
    case "hardBreak":
      return "<br>"
    case "text":
      return inline([node])
    default:
      return (node.content || []).map(render).join("")
  }
}

export function richTextToHtml(content) {
  if (!content) return ""
  if (typeof content === "string") return content
  return render(content)
}
