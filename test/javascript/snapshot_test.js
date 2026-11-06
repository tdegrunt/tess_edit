// Snapshot tests: the MJML each block exports, compared to files in
// test/javascript/snapshots. The sample's compiled HTML is kept in
// test/fixtures/files/sample.html, which the Rails Liquid test renders.
//
// After an intended change in output, regenerate and review the diff:
//
//   UPDATE_SNAPSHOTS=1 npm test

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createDocument, insert, walk } from "tess_edit/core/document"
import { createFromPalette } from "tess_edit/core/document"
import { paletteItems } from "tess_edit/core/registry"
import { starterDocument } from "tess_edit/core/starter"
import { toMjml } from "tess_edit/export/mjml"
import { compile } from "tess_edit/export/compile"

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshots = path.join(here, "snapshots")
const fixtures = path.join(here, "../fixtures/files")
const update = !!process.env.UPDATE_SNAPSHOTS

function matchFile(file, actual) {
  if (update || !existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, actual)
    return
  }
  assert.equal(actual, readFileSync(file, "utf8"), `${path.relative(process.cwd(), file)} changed; run UPDATE_SNAPSHOTS=1 npm test if that is intended`)
}

// Ids are random; number them so editor output is stable.
function stableIds(doc) {
  let n = 0
  walk(doc, (node) => {
    node.id = `b${++n}`
  })
  return doc
}

// A page with the palette item where it belongs: layout items on the page,
// content items in a one-column section.
function documentWith(key) {
  const doc = createDocument()
  const item = createFromPalette(key)
  if (item.type === "column") {
    const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
    insert(doc, section.id, 1, item)
  } else if (["section", "wrapper", "hero"].includes(item.type)) {
    insert(doc, doc.id, 0, item)
  } else {
    const section = insert(doc, doc.id, 0, createFromPalette("section-1"))
    insert(doc, section.children[0].id, 0, item)
  }
  return stableIds(doc)
}

for (const item of paletteItems()) {
  test(`MJML for ${item.label}`, async () => {
    const doc = documentWith(item.key)
    matchFile(path.join(snapshots, `${item.key}.mjml`), toMjml(doc))
    matchFile(path.join(snapshots, "editor", `${item.key}.mjml`), toMjml(doc, { editor: true }))
    const { errors } = await compile(toMjml(doc))
    assert.deepEqual(errors, [])
  })
}

test("MJML and HTML for the sample", async () => {
  const doc = stableIds(starterDocument())
  const mjml = toMjml(doc)
  matchFile(path.join(snapshots, "sample.mjml"), mjml)
  const { html, errors } = await compile(mjml)
  assert.deepEqual(errors, [])
  matchFile(path.join(fixtures, "sample.html"), html)
})

test("compiling is deterministic", async () => {
  const mjml = toMjml(stableIds(starterDocument()))
  const [a, b] = await Promise.all([compile(mjml), compile(mjml)])
  assert.equal(a.html, b.html)
})
