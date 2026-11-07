import { test } from "node:test"
import assert from "node:assert/strict"
import { createNode, createFromPalette } from "tess_edit/core/document"
import { imageField, imageFields, imageSource } from "tess_edit/core/media"
import { getBlock } from "tess_edit/core/registry"

const withMedia = { media: { enabled: true } }
const withoutMedia = { media: { enabled: false } }

test("without the host's images every image is a web image", () => {
  assert.equal(imageSource(createFromPalette("image"), withoutMedia), "web")
})

test("a new image from the Blocks panel is an uploaded one", () => {
  assert.equal(imageSource(createFromPalette("image"), withMedia), "upload")
})

test("an image with a URL and no uploaded image is a web image", () => {
  assert.equal(imageSource(createNode("image", { attributes: { src: "https://example.com/a.png" } }), withMedia), "web")
})

test("an image that refers to an uploaded image is an uploaded one", () => {
  assert.equal(imageSource(createNode("image", { data: { image: "abc" } }), withMedia), "upload")
})

test("the chosen source wins", () => {
  assert.equal(imageSource(createNode("image", { data: { image: "abc", source: "web" } }), withMedia), "web")
})

test("a background image is uploaded when it refers to one of the host's images", () => {
  const field = imageField("attributes.background-url", "Background image", "data.background")
  assert.equal(imageSource(createNode("section", { attributes: { "background-url": "https://example.com/a.png" } }), withMedia, field), "web")
  assert.equal(imageSource(createNode("section", { data: { background: "abc" } }), withMedia, field), "upload")
  assert.equal(imageSource(createNode("section", { data: { background: "abc", backgroundSource: "web" } }), withMedia, field), "web")
})

test("the Image block, heroes, sections and wrappers have an image field", () => {
  const keys = (type) => imageFields(getBlock(type)).map((field) => [field.key, field.image])
  assert.deepEqual(keys("image"), [["attributes.src", "data.image"]])
  for (const type of ["hero", "section", "wrapper"]) assert.deepEqual(keys(type), [["attributes.background-url", "data.background"]])
  assert.deepEqual(keys("text"), [])
})
