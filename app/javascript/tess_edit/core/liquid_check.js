// What's wrong with the Liquid in a text, as far as the editor can tell
// without rendering it: each problem { start, end, message }, where it is in
// the text.
//
//   checkStructure(text)   blocks left open ({% if %} without {% endif %}),
//                          closed without being opened, and elsif, else,
//                          when, break and continue where they can't be
//   checkLiquid(text, { mode, variables, scope })
//                          those, and with the host's variables, filters and
//                          tags (core/variables.js): a variable, filter or tag
//                          that isn't there, a filter given more arguments
//                          than it takes, a compared value that the variable
//                          can't have ({% if line.party == "sponsr" %})
//
// In "output" mode (Liquid in text) only what's in {{ … }} and {% … %}; in
// "expression", "condition" and "collection" mode (an Assign's value, a
// Condition, a Loop's collection) the whole text is one expression. What
// only rendering can tell (a value of the wrong type, nil) isn't checked,
// nor what the host's own tags take (their arguments aren't Liquid's).

import { walk } from "tess_edit/core/document"
import { t } from "tess_edit/core/i18n"
import { BLOCKS, liquidScope, splitOutside, unquote } from "tess_edit/core/liquid"
import { getBlock } from "tess_edit/core/registry"

// The tags in a text: [{ start, end, kind: "output" | "tag", inner, innerStart, name }]
const TAG = /\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g

export function liquidParts(text) {
  const parts = []
  let skip = null
  for (const match of String(text ?? "").matchAll(TAG)) {
    const output = match[1] !== undefined
    const inner = output ? match[1] : match[2]
    const innerStart = match.index + match[0].indexOf(inner, 2)
    const name = output ? null : inner.match(/^\s*(\w+)/)?.[1] || ""
    // Nothing in raw or a comment is Liquid
    if (skip) {
      if (name === `end${skip}`) skip = null
      else continue
    } else if (name === "raw" || name === "comment") {
      skip = name
    }
    parts.push({ start: match.index, end: match.index + match[0].length, kind: output ? "output" : "tag", inner, innerStart, name })
  }
  return parts
}

// Where each tag can be: inside these blocks
const INSIDE = { elsif: ["if", "unless"], else: ["if", "unless", "case", "for"], when: ["case"] }
const IN_LOOP = new Set(["break", "continue"])

export function checkStructure(text, { blocks = BLOCKS } = {}) {
  const problems = []
  const open = []
  for (const part of liquidParts(text)) {
    if (part.kind !== "tag") continue
    const { name } = part
    if (name.startsWith("end") && name.length > 3) {
      const block = name.slice(3)
      const at = open.map((tag) => tag.name).lastIndexOf(block)
      if (at < 0) {
        if (blocks.includes(block)) problems.push(problem(part, t("{% %{tag} %} without {% %{block} %}", { tag: name, block })))
        continue
      }
      for (const inner of open.splice(at).slice(1)) problems.push(problem(inner, t("{% %{tag} %} isn't closed", { tag: inner.name })))
    } else if (INSIDE[name]) {
      if (!INSIDE[name].includes(open.at(-1)?.name)) problems.push(problem(part, t("{% %{tag} %} can only be inside {% %{blocks} %}", { tag: name, blocks: INSIDE[name].join(" %}, {% ") })))
    } else if (IN_LOOP.has(name)) {
      if (!open.some((tag) => tag.name === "for" || tag.name === "tablerow")) problems.push(problem(part, t("{% %{tag} %} can only be inside {% for %}", { tag: name })))
    } else if (blocks.includes(name)) {
      open.push(part)
    }
  }
  for (const tag of open) problems.push(problem(tag, t("{% %{tag} %} isn't closed", { tag: tag.name })))
  return problems
}

function problem({ start, end }, message) {
  return { start, end, message }
}

// Words that aren't variables
const WORDS = new Set(["and", "or", "contains", "in", "blank", "empty", "nil", "null", "true", "false", "reversed", "limit", "offset", "cols", "with", "as", "for"])
// Variables Liquid has in a loop, besides the host's
const LOOPS = new Set(["forloop", "tablerowloop"])
// Tags that aren't blocks of their own, but parts of one, and Liquid's own that are always there
const PARTS = new Set(["else", "elsif", "when", "break", "continue", "liquid"])
// A variable path, with [0] or ["key"] in it
const PATH = /[A-Za-z_][\w-]*\??(?:\.[A-Za-z_][\w-]*\??|\[[^\]]*\])*/g

export async function checkLiquid(text, { mode = "output", variables = null, scope = [] } = {}) {
  text = String(text ?? "")
  const tags = variables ? await variables.tags().catch(() => new Map()) : new Map()
  const filters = variables ? await variables.filters().catch(() => new Map()) : new Map()
  const blocks = [...new Set([...BLOCKS, ...[...tags.values()].filter((tag) => tag.block).map((tag) => tag.name)])]
  const context = { variables: variables?.enabled ? variables : null, filters, scope, roots: null }

  if (mode !== "output") {
    const expression = mode === "collection" ? text.replace(/\s+(?:reversed|(?:limit|offset):\s*\S+)/g, (gap) => " ".repeat(gap.length)) : text
    return checkExpression(expression, 0, mode === "condition", context, [])
  }

  const problems = checkStructure(text, { blocks })
  const local = []
  const cases = []
  for (const part of liquidParts(text)) {
    const at = part.innerStart
    if (part.kind === "output") {
      problems.push(...(await checkExpression(part.inner, at, false, context, local)))
      continue
    }
    const { name, inner } = part
    const args = inner.replace(/^\s*\w+/, "")
    const argsAt = at + inner.length - args.length
    if (name.startsWith("end")) {
      if (name === "endfor" || name === "endtablerow") removeLast(local, (entry) => entry.loop)
      if (name === "endcase") cases.pop()
      continue
    }
    if (tags.size && !tags.has(name) && !PARTS.has(name) && !BLOCKS.includes(name)) {
      problems.push({ start: part.start, end: part.end, message: t("There's no tag %{tag}", { tag: name }) })
      continue
    }
    if (["if", "elsif", "unless"].includes(name)) {
      problems.push(...(await checkExpression(args, argsAt, true, context, local)))
    } else if (name === "case") {
      problems.push(...(await checkExpression(args, argsAt, false, context, local)))
      cases.push(args.trim().match(/^[\w.]+/)?.[0] || null)
    } else if (name === "when") {
      problems.push(...(await checkExpression(args.replace(/\bor\b|,/g, (gap) => " ".repeat(gap.length)), argsAt, false, context, local)))
      const of = cases.at(-1)
      if (of) problems.push(...(await checkValues(args, argsAt, of, context, local)))
    } else if (name === "for" || name === "tablerow") {
      const loop = args.match(/^(\s*)(\w+)(\s+in\s+)([\s\S]*)$/)
      if (loop) {
        const collection = loop[4].replace(/\s+(?:reversed|(?:limit|offset|cols):\s*\S+)/g, (gap) => " ".repeat(gap.length))
        problems.push(...(await checkExpression(collection, argsAt + loop[1].length + loop[2].length + loop[3].length, false, context, local)))
        local.push({ variable: loop[2], collection: loop[4].trim().split(/\s/)[0], loop: true })
      }
    } else if (name === "assign") {
      const assign = args.match(/^(\s*)(\w+)(\s*=\s*)([\s\S]*)$/)
      if (assign) {
        problems.push(...(await checkExpression(assign[4], argsAt + assign[1].length + assign[2].length + assign[3].length, false, context, local)))
        local.push({ variable: assign[2], expression: assign[4].trim() })
      }
    } else if (["capture", "increment", "decrement"].includes(name)) {
      const variable = args.match(/^\s*["']?(\w+)/)?.[1]
      if (variable) local.push({ variable, captured: name === "capture" })
    } else if (name === "echo") {
      problems.push(...(await checkExpression(args, argsAt, false, context, local)))
    }
  }
  return problems.sort((a, b) => a.start - b.start)
}

function removeLast(list, test) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (test(list[i])) return list.splice(i, 1)
  }
}

// Blanks out what's quoted, keeping where everything is
function blankQuotes(text) {
  return text.replace(/(["'])[\s\S]*?\1/g, (quoted) => quoted[0] + " ".repeat(quoted.length - 2) + quoted[0])
}

// An expression's variables and filters: `order.lines | where: "kind", "x" | first`
async function checkExpression(expression, offset, condition, context, local) {
  const problems = []
  const pieces = splitOutside(expression, "|")
  let at = offset
  for (const [index, piece] of pieces.entries()) {
    if (index === 0) {
      problems.push(...(await checkPaths(piece, at, context, local)))
      if (condition) problems.push(...(await checkComparisons(piece, at, context, local)))
    } else {
      problems.push(...(await checkFilter(piece, at, context, local)))
    }
    at += piece.length + 1
  }
  return problems
}

async function checkFilter(piece, offset, context, local) {
  const named = piece.match(/^(\s*)(\w+)/)
  if (!named) return []
  const start = offset + named[1].length
  const name = named[2]
  const filter = context.filters.get(name)
  if (context.filters.size && !filter) return [{ start, end: start + name.length, message: t("There's no filter %{filter}", { filter: name }) }]

  const problems = []
  const call = piece.slice(named[0].length).match(/^(\s*:)([\s\S]*)$/)
  if (!call) return problems
  const argsAt = offset + named[0].length + call[1].length
  const args = splitOutside(call[2], ",")
  // Named arguments (t: name: user.name) aren't counted
  const positional = args.filter((arg) => arg.trim() && !/^\s*\w+\s*:/.test(arg))
  const takes = filter?.arguments?.length || 0
  if (takes && positional.length > takes) {
    problems.push({ start, end: start + name.length, message: t("%{filter} takes %{count} arguments, not %{given}", { filter: name, count: takes, given: positional.length }) })
  }
  let at = argsAt
  for (const arg of args) {
    problems.push(...(await checkPaths(arg.replace(/^\s*\w+\s*:/, (key) => " ".repeat(key.length)), at, context, local)))
    at += arg.length + 1
  }
  return problems
}

// The variables in a piece of an expression, outside quotes
async function checkPaths(piece, offset, context, local) {
  if (!context.variables) return []
  const problems = []
  const blank = blankQuotes(piece)
  for (const match of blank.matchAll(PATH)) {
    const before = blank.slice(0, match.index)
    // Part of a number (1.5) or a named argument's key (limit: 3)
    if (/[\w"']$/.test(before) || /^\s*:/.test(blank.slice(match.index + match[0].length))) continue
    const found = await checkPath(match[0], context, local)
    if (found) problems.push({ start: offset + match.index + found.at, end: offset + match.index + found.at + found.length, message: found.message })
  }
  return problems
}

// The text's own variables before the scope around it, nearest first
function scopeOf(context, local) {
  return [...local].reverse().filter((entry) => entry.collection || entry.expression || entry.captured).concat(context.scope)
}

// What's wrong with a path: the first name that isn't there
async function checkPath(path, context, local) {
  const { variables } = context
  const scope = scopeOf(context, local)
  const names = path.split(/\[/)[0].split(".")
  const root = names[0].replace(/\?$/, "")
  if (WORDS.has(root)) return null
  // Only in a loop: a Loop block's, or one in the text
  if (LOOPS.has(root)) {
    if (local.some((entry) => entry.loop) || context.scope.some((entry) => entry.collection)) return null
    return { at: 0, length: root.length, message: t("There's no variable %{name}", { name: root }) }
  }
  // A variable of the text's own ({% assign %}, {% for %}) or of the blocks around it
  const own = local.some((entry) => entry.variable === root) || context.scope.some((entry) => entry.variable === root)
  if (!own) {
    context.roots ||= await variables.options("", context.scope).catch(() => [])
    if (!context.roots.length) return null
    if (!context.roots.some((variable) => variable.name === root)) return { at: 0, length: root.length, message: t("There's no variable %{name}", { name: root }) }
  }
  // Each name after it, as far as its parent's variables are known
  let at = names[0].length + 1
  for (let i = 1; i < names.length; i++) {
    const parent = names.slice(0, i).join(".")
    const variable = await variables.lookup(parent, scope).catch(() => null)
    if (!variable?.children) return null
    const options = await variables.options(parent, scope).catch(() => [])
    if (!options.length) return null
    const name = names[i].replace(/\?$/, "")
    if (name !== "size" && !options.some((option) => option.name === name)) return { at, length: names[i].length, message: t("%{path} has no %{name}", { path: parent, name }) }
    at += names[i].length + 1
  }
  return null
}

// A comparison with a quoted value the variable can't have
async function checkComparisons(piece, offset, context, local) {
  const problems = []
  for (const match of piece.matchAll(/([A-Za-z_][\w.]*)\s*(?:==|!=|<>)\s*(["'])([^"']*)\2/g)) {
    const at = offset + match.index + match[0].length - match[3].length - 2
    problems.push(...(await checkValues(`${match[2]}${match[3]}${match[2]}`, at, match[1], context, local)))
  }
  return problems
}

// Quoted values, separated by , or or, that a variable can't have
async function checkValues(text, offset, path, context, local) {
  if (!context.variables) return []
  const variable = await context.variables.lookup(path, scopeOf(context, local)).catch(() => null)
  const values = variable?.values?.map((value) => String(value.value))
  if (!values?.length) return []
  const problems = []
  for (const match of text.matchAll(/(["'])([^"']*)\1/g)) {
    if (!values.includes(unquote(match[0]))) problems.push({ start: offset + match.index, end: offset + match.index + match[0].length, message: t("%{path} is never %{value}", { path, value: match[0] }) })
  }
  return problems
}

// The text of a Tiptap document as checked: its paragraphs and headings one
// to a line, an inline node (a line break) one character, as
// ProseMirror's textBetween gives them (ui/text_editing.js)
const TEXTBLOCKS = new Set(["paragraph", "heading"])

export function richText(content) {
  const lines = []
  const collect = (node) => {
    if (TEXTBLOCKS.has(node?.type)) lines.push((node.content || []).map((inline) => (inline.type === "text" ? inline.text : "\ufffc")).join(""))
    else (node?.content || []).forEach(collect)
  }
  collect(content)
  return lines.join("\n")
}

// The Liquid in a document's blocks: [{ id, key, mode, text, scope }], from
// their fields with a liquid mode, their rich texts, and any other text with
// {{ or {% in it
export function liquidTexts(doc) {
  const texts = []
  walk(doc, (node) => {
    const modes = new Map()
    for (const group of getBlock(node.type)?.fields || []) {
      for (const field of group.fields || []) {
        if (field.liquid) modes.set(field.key, typeof field.liquid === "string" ? field.liquid : "output")
      }
    }
    const found = []
    const visit = (value, key) => {
      if (typeof value === "string") {
        const mode = modes.get(key)
        if (mode && mode !== "output" ? value.trim() : /\{\{|\{%/.test(value)) found.push({ key, mode: mode || "output", text: value })
      } else if (value?.type === "doc" && Array.isArray(value.content)) {
        const text = richText(value)
        if (/\{\{|\{%/.test(text)) found.push({ key, mode: "output", text, rich: true })
      } else if (value && typeof value === "object") {
        for (const [name, item] of Object.entries(value)) visit(item, `${key}.${name}`)
      }
    }
    visit(node.data || {}, "data")
    visit(node.attributes || {}, "attributes")
    if (found.length) {
      const scope = liquidScope(doc, node.id)
      for (const entry of found) texts.push({ id: node.id, scope, ...entry })
    }
  })
  return texts
}

// The problems in a document, checked again a moment after it changes,
// for the editor to show: by block, and by block and key
//
//   checker.schedule()        after a change
//   checker.subscribe(fn)     fn() when there are new ones
//   checker.problems(id)      [{ key, text, problems }] of a block
//   checker.field(id, key)    { text, problems } of one of its texts, or null
export class LiquidChecker {
  constructor(editor, { delay = 400 } = {}) {
    this.editor = editor
    this.delay = delay
    this.results = new Map()
    this.listeners = new Set()
    this.runs = 0
    // None to start with
    this.key = "[]"
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  schedule() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.check(), this.delay)
  }

  async check() {
    const run = ++this.runs
    const results = new Map()
    for (const entry of liquidTexts(this.editor.doc)) {
      const problems = await checkLiquid(entry.text, { mode: entry.mode, variables: this.editor.variables, scope: entry.scope })
      // A newer check has started
      if (run !== this.runs) return
      if (!problems.length) continue
      if (!results.has(entry.id)) results.set(entry.id, [])
      results.get(entry.id).push({ key: entry.key, text: entry.text, problems })
    }
    // Only when they're other than they were: showing them renders Layers again
    const key = JSON.stringify([...results])
    if (key === this.key) return
    this.key = key
    this.results = results
    this.listeners.forEach((fn) => fn())
  }

  problems(id) {
    return this.results.get(id) || []
  }

  field(id, key) {
    return this.problems(id).find((entry) => entry.key === key) || null
  }

  stop() {
    clearTimeout(this.timer)
    this.runs++
  }
}
