import { test } from "node:test"
import assert from "node:assert/strict"
import { strftime } from "tess_edit/ui/variable_menu"

const date = new Date(2026, 2, 5, 9, 7)

test("a date in Ruby's strftime formats, in a language", () => {
  assert.equal(strftime(date, "%-d %B %Y", "en"), "5 March 2026")
  assert.equal(strftime(date, "%-d %B %Y", "nl"), "5 maart 2026")
  assert.equal(strftime(date, "%d-%m-%Y %H:%M", "nl"), "05-03-2026 09:07")
  assert.equal(strftime(date, "%-d-%-m-%y", "nl"), "5-3-26")
  assert.equal(strftime(date, "%A", "nl"), "donderdag")
  // A code it doesn't know stays as written
  assert.equal(strftime(date, "%Q", "en"), "%Q")
})
