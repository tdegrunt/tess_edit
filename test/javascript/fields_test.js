import { test } from "node:test"
import assert from "node:assert/strict"
import { FONTS, fontOptions, typography } from "tess_edit/blocks/fields"

test("a font field offers the host's fonts, or common ones, after the placeholder", () => {
  assert.equal(typography().fields[0].type, "font")
  assert.deepEqual(fontOptions(undefined, "", "Inherit"), [{ value: "", label: "Inherit" }, ...FONTS])
  assert.deepEqual(fontOptions(["Maytra", "'EB Garamond', serif", { value: "Helvetica, Arial, sans-serif", label: "Helvetica" }], ""), [
    { value: "", label: "Default" },
    { value: "Maytra", label: "Maytra" },
    { value: "'EB Garamond', serif", label: "EB Garamond" },
    { value: "Helvetica, Arial, sans-serif", label: "Helvetica" }
  ])
})

test("a font that isn't offered stays, as it is", () => {
  const options = fontOptions(["Maytra"], "Comic Sans MS")
  assert.deepEqual(options.at(-1), { value: "Comic Sans MS", label: "Comic Sans MS" })
  assert.equal(fontOptions(["Maytra"], "Maytra").length, 2)
})
