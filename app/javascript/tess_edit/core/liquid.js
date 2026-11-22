// What's being written in Liquid at the caret, and what a block can use there.
//
// liquidContext reads the text before the caret and says what goes there:
//
//   "{{ order.cus"                         → { kind: "variable", path: "order.cus" }
//   "{{ order.placed_at | da"              → { kind: "filter", partial: "da", input: "order.placed_at" }
//   "{{ lines | where: \"pa"               → { kind: "argument", filter: "where", index: 0, partial: "pa", quote: "\"" }
//   "{{ lines | where: \"party\", "        → { kind: "argument", filter: "where", index: 1, partial: "", args: ["party"] }
//   "{% if line.party == \"sp"             → { kind: "value", of: "line.party", partial: "sp", quote: "\"" }
//   "{% el"                                → { kind: "tag", partial: "el", open: ["if"] }
//   "{% if line.party "                    → { kind: "operator", partial: "" }
//
// each with `start`, where what it replaces starts in the text, and `tag`
// ("{{", "{%" or null). In "output" mode (Liquid in text) only inside {{ … }}
// or {% … %}; in "expression" mode (a Loop's collection, an Assign's value)
// anywhere, and in "condition" mode (a Condition) too, with its operators as
// in {% if %}. A tag's `open` are the blocks open before it, innermost last,
// for what can go inside them (elsif, when, endfor); `blocks` says which tags
// are blocks besides Liquid's. The editor's menu (ui/variable_menu.js) asks the
// host for what fits: its variables, its filters and their arguments, the
// values a variable can have (core/variables.js).
//
// liquidScope says which variables a block has besides the host's: its Loop
// blocks' and the Assigns before it, nearest first. An Assign's variable is
// what its expression comes to; through filters that keep a collection what
// it is (where, sort, …) it's still that collection (core/variables.js).

import { find } from "tess_edit/core/document"

const PATH = /[A-Za-z_][\w]*(?:\.[\w]*)*/
const NAME = /^\w+$/
// Liquid's tags that are blocks, with an end tag
export const BLOCKS = ["capture", "case", "comment", "for", "if", "ifchanged", "raw", "tablerow", "unless"]
// Words in conditions that aren't variables
const KEYWORDS = new Set(["if", "unless", "elsif", "when", "and", "or", "contains", "in", "blank", "empty", "nil", "null", "true", "false"])
// An operand in a condition: a variable, a quoted text or a number
const OPERAND = new RegExp(`(?:${PATH.source}|"[^"]*"|'[^']*'|-?\\d+(?:\\.\\d+)?)`)

// The block tags open at the end of a text, outermost first, each { name, expression }
export function openBlocks(text, blocks = BLOCKS) {
  const open = []
  for (const match of text.matchAll(/\{%-?\s*(\w+)([\s\S]*?)-?%\}/g)) {
    const name = match[1]
    if (name.startsWith("end")) {
      const at = open.map((block) => block.name).lastIndexOf(name.slice(3))
      if (at >= 0) open.splice(at)
    } else if (blocks.includes(name)) {
      open.push({ name, expression: match[2].trim() })
    }
  }
  return open
}

// The parts of a Liquid expression outside quotes, split at `separator`
// (| between filters, , between arguments)
export function splitOutside(text, separator) {
  const parts = []
  let quote = null
  let current = ""
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === separator) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

// The quote a text ends inside, and where it opened, if it does
function openQuote(text) {
  let quote = null
  let at = -1
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
      at = i
    }
  }
  return quote ? { quote, at } : null
}

// A quoted argument's text, or the argument as written
export function unquote(text) {
  const trimmed = text.trim()
  const match = trimmed.match(/^(["'])(.*)\1$/)
  return match ? match[2] : trimmed
}

export function liquidContext(before, mode = "output", { blocks = BLOCKS } = {}) {
  let expression = before
  let tag = null
  let opened = 0
  if (mode === "output") {
    const output = before.lastIndexOf("{{")
    const open = Math.max(output, before.lastIndexOf("{%"))
    if (open < 0 || Math.max(before.lastIndexOf("}}"), before.lastIndexOf("%}")) > open) return null
    tag = open === output ? "{{" : "{%"
    opened = open
    expression = before.slice(open + 2).replace(/^-/, "")
  }
  const offset = before.length - expression.length
  const quoted = openQuote(expression)
  const head = quoted ? expression.slice(0, quoted.at) : expression

  // A tag's name: {% el
  const named = tag === "{%" && !quoted && expression.match(/^\s*(\w*)$/)
  if (named) return { kind: "tag", start: before.length - named[1].length, partial: named[1], open: openBlocks(before.slice(0, opened), blocks).map((block) => block.name), tag }

  // A case's values: {% when "a", "b
  const when = tag === "{%" && head.match(/^\s*when\s+((?:(?:"[^"]*"|'[^']*'|[\w.]+)\s*(?:,|\bor\b)\s*)*)$/)
  if (when) {
    const kase = openBlocks(before.slice(0, opened), blocks).filter((block) => block.name === "case").at(-1)
    const of = kase?.expression.match(new RegExp(`^${PATH.source}`))?.[0]
    if (!of) return null
    const partial = quoted ? expression.slice(quoted.at + 1) : ""
    if (!quoted && !/(?:\s|,)$/.test(expression)) return null
    return { kind: "value", of, start: quoted ? offset + quoted.at : before.length, partial, quote: quoted?.quote || null, tag }
  }

  // In a filter's arguments: | name: a, b, …
  const filters = splitOutside(head, "|")
  if (filters.length > 1) {
    const current = filters.at(-1)
    const input = filters.slice(0, -1).join("|").trim()
    const named = current.match(/^\s*(\w*)$/)
    if (named && !quoted) return { kind: "filter", start: before.length - named[1].length, partial: named[1], input, tag }

    const call = current.match(/^\s*(\w+)\s*:([\s\S]*)$/)
    if (call) {
      const args = splitOutside(call[2], ",")
      const written = args.slice(0, -1).map(unquote)
      if (quoted) {
        const partial = expression.slice(quoted.at + 1)
        return { kind: "argument", filter: call[1], index: args.length - 1, args: written, start: offset + quoted.at, partial, quote: quoted.quote, input, tag }
      }
      const last = args.at(-1)
      const path = last.match(new RegExp(`^\\s*(${PATH.source})?$`))
      if (path) {
        const partial = path[1] || ""
        return { kind: "argument", filter: call[1], index: args.length - 1, args: written, start: before.length - partial.length, partial, quote: null, input, tag }
      }
      return null
    }
    if (quoted) return null
  }

  // A value compared with a variable: line.party == "sp
  // (unquoted, a word: blank, empty, or a variable's name)
  const compared = quoted
    ? head.match(new RegExp(`(${PATH.source})\\s*(?:==|!=|<>|\\bcontains\\b)\\s*$`))
    : expression.match(new RegExp(`(${PATH.source})\\s*(?:==|!=|<>|\\bcontains)\\s*(\\w*)$`))
  if (compared && !KEYWORDS.has(compared[1])) {
    const partial = quoted ? expression.slice(quoted.at + 1) : compared[2]
    return { kind: "value", of: compared[1], start: quoted ? offset + quoted.at : before.length - partial.length, partial, quote: quoted?.quote || null, tag }
  }
  if (quoted) return null

  // An operator after an operand in a condition: {% if line.party co
  const condition = mode === "condition" || (tag === "{%" && /^\s*(?:if|unless|elsif)\b/.test(expression))
  const operator = condition && expression.match(new RegExp(`(?:^|\\s)(${OPERAND.source})\\s+([=!<>]*|[a-z]*)$`))
  if (operator && !KEYWORDS.has(operator[1])) return { kind: "operator", start: before.length - operator[2].length, partial: operator[2], tag }

  const match = expression.match(new RegExp(`(?:^|[^\\w.])(${PATH.source})?$`))
  if (!match) return null
  const path = match[1] || ""
  return { kind: "variable", start: before.length - path.length, path, tag }
}

// The variable path an expression starts from, and the filters after it:
//   'contract.lines | where: "party", "account" | sort' → { path: "contract.lines", filters: ["where", "sort"] }
// In a tag, the path is the last one before the first |: "assign x = order.lines"
export function expressionParts(expression) {
  const [first, ...rest] = splitOutside(expression, "|")
  const paths = first.replace(/(["'])[\s\S]*?\1/g, " ").match(new RegExp(PATH.source, "g")) || []
  const path = paths.filter((candidate) => !["assign", "for", "in", "if", "unless", "elsif", "and", "or", "contains"].includes(candidate)).at(-1)
  if (!path) return null
  return { path, filters: rest.map((filter) => filter.trim().match(/^\w+/)?.[0]).filter(Boolean) }
}

// The variables a block can use: its Loops' and the Assigns before it (in
// its container, or in one around it), nearest first
//   [{ variable, collection }]   a Loop's: each of a collection
//   [{ variable, expression }]   an Assign's: what its expression comes to
export function liquidScope(doc, id) {
  const scope = []
  let hit = find(doc, id)
  while (hit?.parent) {
    for (const sibling of hit.parent.children.slice(0, hit.index).reverse()) {
      if (sibling.type !== "assign") continue
      const { variable, expression } = sibling.data || {}
      if (NAME.test(variable || "") && expression) scope.push({ variable, expression })
    }
    if (hit.parent.type === "loop") {
      const variable = hit.parent.data.variable || "item"
      const collection = hit.parent.data.collection || "items"
      if (NAME.test(variable)) scope.push({ variable, collection })
    }
    hit = find(doc, hit.parent.id)
  }
  return scope
}

// The assigns ({% assign x = … %}) and loops ({% for x in … %}) earlier in a
// text, before the caret, nearest first, as liquidScope gives them
export function textScope(before) {
  const scope = []
  for (const match of before.matchAll(/\{%-?\s*(assign|for)\s+(\w+)\s*(=|in)\s*([\s\S]*?)\s*-?%\}/g)) {
    if (match[1] === "assign" && match[3] === "=") scope.unshift({ variable: match[2], expression: match[4] })
    if (match[1] === "for" && match[3] === "in") {
      // Only while the loop is open
      const after = before.slice(match.index + match[0].length)
      if (!/\{%-?\s*endfor\b/.test(after)) scope.unshift({ variable: match[2], collection: match[4].split(/\s/)[0] })
    }
  }
  return scope
}

// What replaces a quoted argument or value, in the quote it was started
// with, and how much of the text after the caret it takes: its closing quote,
// when that's there already
export function quoted(value, { quote = null, after = "" } = {}) {
  const mark = quote || '"'
  return { text: `${mark}${value}${mark}`, through: after.startsWith(mark) ? 1 : 0 }
}
