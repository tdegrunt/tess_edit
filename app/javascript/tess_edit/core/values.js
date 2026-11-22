// Values from the host app for the Liquid in a document, such as a
// contract's for {{ contract.account.name }} when the editor is a record's:
// the canvas and text being edited show an expression's value in place of
// its Liquid, and the Liquid again when the caret goes into it.
//
// The host gives them by the expression as it's written in the tag, without
// the braces, filters and all:
//
//   { "contract.account.name": "sv COFA", "contract.starts_on | date: '%-d %B %Y'": "1 maart 2025" }
//
// with the kit's canvas result ({ html, errors, values }), for a canvas the
// host renders, or with the editor's setValues(values). An expression without
// one keeps its Liquid; t filters are translations (core/translations.js).
// An empty string is a value that is empty for now (the contract's sponsor
// has no chamber of commerce number yet): it keeps its Liquid, in red, as
// something to fill in where it comes from. null is no value known.

import { translationCalls } from "tess_edit/core/translations"

// An output tag, {{ … }}, with its expression
const OUTPUT = /\{\{-?\s*((?:(?!\}\}).)+?)\s*-?\}\}/g

// The expression of a tag as the host gets it: its whitespace as one space
export function normalizeExpression(expression) {
  return String(expression ?? "").trim().replace(/\s+/g, " ")
}

// The output tags in a text that aren't t filters: [{ start, end, expression, text }]
export function valueCalls(text) {
  if (typeof text !== "string" || !text.includes("{{")) return []
  const translations = translationCalls(text)
  return Array.from(text.matchAll(OUTPUT), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    expression: normalizeExpression(match[1]),
    text: match[0]
  })).filter((call) => !translations.some((translation) => translation.start === call.start))
}

// Every expression in a document's texts and settings
export function expressionsIn(value, expressions = new Set()) {
  if (typeof value === "string") {
    for (const call of valueCalls(value)) expressions.add(call.expression)
  } else if (Array.isArray(value)) {
    value.forEach((item) => expressionsIn(item, expressions))
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => expressionsIn(item, expressions))
  }
  return expressions
}

// The values the editor has from the host app, by expression
export class Values {
  constructor() {
    this.entries = new Map()
    this.empties = new Set()
    this.listeners = new Set()
  }

  get enabled() {
    return this.entries.size > 0 || this.empties.size > 0
  }

  // Calls fn whenever they change
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  // Replaces them all; false when nothing changed. An empty string is an
  // empty value (empty), null none.
  set(values) {
    const entries = new Map()
    const empties = new Set()
    for (const [expression, value] of Object.entries(values || {})) {
      if (value === null || value === undefined) continue
      if (value === "") empties.add(normalizeExpression(expression))
      else entries.set(normalizeExpression(expression), String(value))
    }
    const same = entries.size === this.entries.size && [...entries].every(([key, value]) => this.entries.get(key) === value) &&
      empties.size === this.empties.size && [...empties].every((key) => this.empties.has(key))
    if (same) return false
    this.entries = entries
    this.empties = empties
    this.listeners.forEach((fn) => fn())
    return true
  }

  // Whether the host says it's empty for now
  empty(expression) {
    return this.empties.has(normalizeExpression(expression))
  }

  // Its text, or null when there's none
  value(expression) {
    return this.entries.get(normalizeExpression(expression)) ?? null
  }
}
