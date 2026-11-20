import { test } from "node:test"
import assert from "node:assert/strict"
import { setTranslations, t } from "tess_edit/core/i18n"

test("says a text in the page's language, its placeholders filled, else in English", () => {
  setTranslations({ "Preview text": "Voorbeeldtekst", "Edit %{label} in a larger window": "%{label} in een groter venster bewerken" })

  assert.equal(t("Preview text"), "Voorbeeldtekst")
  assert.equal(t("Edit %{label} in a larger window", { label: "HTML" }), "HTML in een groter venster bewerken")
  assert.equal(t("Breakpoint"), "Breakpoint")
  assert.equal(t("No argument for %{names} in the t filter", { names: "%{name}" }), "No argument for %{name} in the t filter")
  assert.equal(t("%{key} is left as it is"), "%{key} is left as it is")
  assert.equal(t(undefined), undefined)
  assert.equal(t(""), "")

  setTranslations(null)
  assert.equal(t("Preview text"), "Preview text")
})

test("config/locales has each text the editor can show, in English and Dutch", async () => {
  globalThis.window ||= { location: { href: "https://www.example.com/editor" } }
  globalThis.document ||= { querySelector: () => null }
  const { editorWords, localeWords } = await import("./words.mjs")
  const english = new Set(localeWords("config/locales/en.yml"))

  assert.deepEqual(editorWords().filter((text) => !english.has(text)), [])
  assert.equal(localeWords("config/locales/nl.yml").length, english.size)
})
