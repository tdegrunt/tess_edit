// Images to choose from, kept by the host app. The editor's mediaUrl answers:
//
//   GET                                → { images: [{ id, url, name }] }
//   POST multipart/form-data, "file"   → { id, url, name }, or { errors: [...] }
//
// `id` is the host's own reference to the image, `url` is where the email
// loads it from. An image field (type "image") stores both: the URL in its
// key, the id and where the image comes from in its `image` and `source` keys.

import { getValue } from "tess_edit/core/document"

function csrfHeaders() {
  const token = document.querySelector("meta[name='csrf-token']")?.content
  return token ? { "X-CSRF-Token": token } : {}
}

async function json(response, action) {
  const result = (response.headers.get("Content-Type") || "").includes("json") ? await response.json() : null
  if (!response.ok || !result) throw new Error(result?.errors?.join(", ") || `${action} failed (${response.status} ${response.statusText})`)
  return result
}

export async function fetchMedia(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
  return (await json(response, "Loading the images")).images || []
}

export async function uploadMedia(url, file) {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(url, { method: "POST", headers: { Accept: "application/json", ...csrfHeaders() }, body, credentials: "same-origin" })
  return json(response, "The upload")
}

// The Image block's image field
export const IMAGE_FIELD = { key: "attributes.src", image: "data.image", source: "data.source" }

// An image field for an image attribute, e.g. a background:
//   imageField("attributes.background-url", "Background image", "data.background")
export function imageField(key, label, image) {
  return { key, label, type: "image", image, source: `${image}Source` }
}

// The image fields of a block definition
export function imageFields(definition) {
  return (definition?.fields || []).flatMap((group) => group.fields || []).filter((field) => field.type === "image")
}

// Where a field's image comes from: "upload" (one of the host's images) or
// "web" (any URL). Without a mediaUrl there are only web images.
export function imageSource(node, editor, field = IMAGE_FIELD) {
  if (!editor?.media?.enabled) return "web"
  return getValue(node, field.source) || (getValue(node, field.image) ? "upload" : "web")
}
