import { test } from "node:test"
import assert from "node:assert/strict"
import { createDocument, createNode, insert } from "tess_edit/core/document"
import { Translations, keyCompletion, keyToken, keysIn, suggestKey, translationCalls, translationTag, validKey } from "tess_edit/core/translations"

globalThis.window ||= { location: { href: "https://www.example.com/editor" } }
globalThis.document ||= { querySelector: () => null }

test("finds t filters on quoted keys, with their arguments' locale", () => {
  const text = `Hi {{ '.greeting' | t }}, {{"order.shipped"|t: name: order.name, locale: 'nl'}} {{ name }} {{ '.x' | upcase }}`
  const calls = translationCalls(text)
  assert.deepEqual(calls.map(({ key, locale }) => ({ key, locale })), [
    { key: ".greeting", locale: null },
    { key: "order.shipped", locale: "nl" }
  ])
  assert.equal(text.slice(calls[0].start, calls[0].end), "{{ '.greeting' | t }}")
  assert.equal(calls[1].text, `{{"order.shipped"|t: name: order.name, locale: 'nl'}}`)
  assert.deepEqual(translationCalls("{{- '.trimmed' | translate -}}").map((call) => call.key), [".trimmed"])
  assert.deepEqual(translationCalls("{{ key_variable | t }}"), [])
  assert.deepEqual(translationCalls(null), [])
})

test("collects the keys in a document's texts and settings", () => {
  const doc = createDocument()
  doc.data.subject = "{{ '.subject' | t }}"
  const section = createNode("section")
  insert(doc, doc.id, 0, section)
  const column = createNode("column")
  insert(doc, section.id, 0, column)
  const text = createNode("text")
  text.data.content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{ '.intro' | t }} and {{ '.subject' | t }}" }] }] }
  insert(doc, column.id, 0, text)
  assert.deepEqual([...keysIn(doc)].sort(), [".intro", ".subject"])
})

test("suggests a key from a text", () => {
  assert.equal(suggestKey("Thanks for your order, {{ name }}!"), ".thanks_for_your_order")
  assert.equal(suggestKey("Één café per dag houdt de dokter weg"), ".een_cafe_per_dag_houdt")
  assert.equal(suggestKey("!!!"), ".text")
})

test("keys are dotted words, optionally starting with a dot", () => {
  assert.ok(validKey(".greeting"))
  assert.ok(validKey("order.shipped_at-2"))
  assert.ok(!validKey(""))
  assert.ok(!validKey(".greeting."))
  assert.ok(!validKey("hello world"))
  assert.equal(translationTag(".greeting"), "{{ '.greeting' | t }}")
})

test("completes the key being typed in a t filter", () => {
  assert.deepEqual(keyToken("Hi {{ '.gr"), { start: 7, partial: ".gr", quote: "'" })
  assert.deepEqual(keyToken('{{"'), { start: 3, partial: "", quote: '"' })
  assert.equal(keyToken("Hi {{ name"), null)
  assert.equal(keyToken("{{ '.a' | t }} '.b"), null)
  assert.equal(keyCompletion(".greeting", "'", ""), ".greeting' | t }}")
  assert.equal(keyCompletion(".greeting", "'", " }}"), ".greeting' | t")
  assert.equal(keyCompletion(".greeting", "'", "' | t }}"), ".greeting")
})

function host(answers) {
  const requests = []
  const fetch = async (url, options = {}) => {
    requests.push({ method: options.method || "GET", keys: url.searchParams?.get("keys"), body: options.body && JSON.parse(options.body) })
    const body = options.method === "PATCH" ? answers.patch(JSON.parse(options.body)) : answers.get(url.searchParams.get("keys"))
    return { ok: !body.errors, status: body.errors ? 422 : 200, statusText: "", headers: { get: () => "application/json" }, json: async () => body }
  }
  return { translations: new Translations("/translations", { fetch }), requests }
}

test("loads the keys it doesn't have, once", async () => {
  const { translations, requests } = host({
    get: (keys) => ({
      locales: ["en", "nl"],
      translations: keys ? { ".greeting": { en: { value: "Hello", source: "en › greeting", url: "/locales/1" }, nl: null } } : {},
      suggestions: [".greeting", ".signature"]
    })
  })
  let changes = 0
  translations.subscribe(() => changes++)

  await translations.load([".greeting", ".unknown"])
  await translations.load([".greeting"])
  assert.deepEqual(requests.map((request) => request.keys), [".greeting,.unknown"])
  assert.deepEqual(translations.locales, ["en", "nl"])
  assert.equal(translations.value(".greeting", "en"), "Hello")
  assert.equal(translations.get(".greeting", "en").url, "/locales/1")
  assert.equal(translations.value(".greeting", "nl"), null)
  assert.deepEqual(translations.missing(".greeting"), ["nl"])
  assert.deepEqual(translations.missing(".unknown"), ["en", "nl"])
  assert.deepEqual(translations.suggestions, [".greeting", ".signature"])
  assert.equal(changes, 1)
})

test("saves a text, and says why it couldn't", async () => {
  const { translations, requests } = host({
    get: () => ({ locales: ["en", "nl"], translations: {}, suggestions: [] }),
    patch: ({ key, locale, value }) => (value ? { key, translation: { [locale]: { value } } } : { errors: ["can't be blank"] })
  })
  await translations.load()
  await translations.save(".thanks", "nl", "Bedankt")
  assert.deepEqual(requests.at(-1), { method: "PATCH", keys: null, body: { key: ".thanks", locale: "nl", value: "Bedankt" } })
  assert.equal(translations.value(".thanks", "nl"), "Bedankt")
  assert.deepEqual(translations.suggestions, [".thanks"])
  await assert.rejects(translations.save(".thanks", "nl", ""), /can't be blank/)
})
