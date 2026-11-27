import { test } from "node:test"
import assert from "node:assert/strict"
import { formatColor, parseColor } from "tess_edit/core/color"

test("a color is read as its hex and its opacity", () => {
  assert.deepEqual(parseColor("#2563EB"), { hex: "#2563eb", alpha: 1 })
  assert.deepEqual(parseColor("#fff"), { hex: "#ffffff", alpha: 1 })
  assert.deepEqual(parseColor("#2563eb80"), { hex: "#2563eb", alpha: 0.5 })
  assert.deepEqual(parseColor("rgb(37, 99, 235)"), { hex: "#2563eb", alpha: 1 })
  assert.deepEqual(parseColor("rgba(37,99,235,0.25)"), { hex: "#2563eb", alpha: 0.25 })
  assert.deepEqual(parseColor("rgba(37, 99, 235, 40%)"), { hex: "#2563eb", alpha: 0.4 })
  assert.deepEqual(parseColor("transparent"), { hex: "#ffffff", alpha: 0 })
})

test("what isn't a color it knows isn't read: empty, a name, Liquid, out of range", () => {
  for (const value of ["", null, undefined, "red", "{{ account.color }}", "rgb(300, 0, 0)", "rgba(0, 0, 0, 2)", "#12345"]) {
    assert.equal(parseColor(value), null, String(value))
  }
})

test("a color is written as its hex when opaque, else as rgba()", () => {
  assert.equal(formatColor("#2563eb", 1), "#2563eb")
  assert.equal(formatColor("#2563eb", 0.5), "rgba(37, 99, 235, 0.5)")
  assert.equal(formatColor("#2563eb", 0), "rgba(37, 99, 235, 0)")
  assert.equal(formatColor("#2563eb", 0.333), "rgba(37, 99, 235, 0.33)")
})
