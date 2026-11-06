// MJML → HTML on the server. The editor posts the MJML to the engine's compile
// endpoint, which compiles it with MRML (TessEdit.compile in Ruby), so the
// canvas shows the same HTML the host app sends.
//
// Resolves to { html, errors }: html is null when the MJML could not be
// compiled or the request failed, with the reasons in errors. Resolves to null
// when the request was aborted through options.signal.

export const COMPILE_URL = "/tess_edit/compile"

export async function compile(mjml, { url = COMPILE_URL, signal } = {}) {
  const token = document.querySelector("meta[name='csrf-token']")?.content
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
      body: JSON.stringify({ mjml }),
      credentials: "same-origin",
      signal
    })
    const result = (response.headers.get("Content-Type") || "").includes("json") ? await response.json() : null
    if (!result) return { html: null, errors: [`The compile request failed (${response.status} ${response.statusText})`] }
    return { html: result.html ?? null, errors: result.errors || [] }
  } catch (error) {
    if (error.name === "AbortError") return null
    return { html: null, errors: [`The compile request failed: ${error.message}`] }
  }
}
