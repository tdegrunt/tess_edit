import { test } from "node:test"
import assert from "node:assert/strict"
import { createNode, createFromPalette } from "tess_edit/core/document"
import { imageSource } from "tess_edit/core/media"

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
