import { test } from "node:test"
import assert from "node:assert/strict"
import { debounce } from "tess_edit/ui/dom"

test("a debounced call says it's waiting, and can be made at once", async () => {
  const calls = []
  const later = debounce((value) => calls.push(value) && value, 20)
  assert.equal(later.pending(), false)
  later(1)
  later(2)
  assert.equal(later.pending(), true)
  assert.equal(later.flush(), 2)
  assert.deepEqual(calls, [2])
  assert.equal(later.pending(), false)
  assert.equal(later.flush(), undefined)

  later(3)
  later.cancel()
  later(4)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.deepEqual(calls, [2, 4])
  assert.equal(later.pending(), false)
})
