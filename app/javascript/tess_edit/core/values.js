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
    this.listeners = new Set()
  }

  get enabled() {
    return this.entries.size > 0
  }

  // Calls fn whenever they change
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  // Replaces them all; false when nothing changed. Empty values are none.
  set(values) {
    const entries = new Map()
    for (const [expression, value] of Object.entries(values || {})) {
      if (value === null || value === undefined || value === "") continue
      entries.set(normalizeExpression(expression), String(value))
    }
    if (entries.size === this.entries.size && [...entries].every(([key, value]) => this.entries.get(key) === value)) return false
    this.entries = entries
    this.listeners.forEach((fn) => fn())
    return true
  }

  // Its text, or null when there's none
  value(expression) {
    return this.entries.get(normalizeExpression(expression)) ?? null
  }
}
