// Images to choose from, kept by the host app. The editor's mediaUrl answers:
//
//   GET                                → { images: [{ id, url, name }] }
//   POST multipart/form-data, "file"   → { id, url, name }, or { errors: [...] }
//
// `id` is the host's own reference to the image (the editor stores it in an
// Image block's data.image), `url` is where the email loads it from.

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

// Where an Image block's image comes from: "upload" (one of the host's
// images) or "web" (any URL). Without a mediaUrl there are only web images.
export function imageSource(node, editor) {
  if (!editor?.media?.enabled) return "web"
  return node.data?.source || (node.data?.image ? "upload" : "web")
}
