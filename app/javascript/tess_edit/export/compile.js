// Compiling on the server, for a kit whose output the browser can't make
// itself, such as an email's MJML that becomes HTML. The host (or a gem)
// registers a compiler by name in Ruby (TessEdit.register_compiler), and the
// kit posts its source to the engine's compile endpoint, POST /tess_edit/compile
// with { compiler, source }:
//
//   compile(mjml, { compiler: "mjml", url: compileUrl, signal })
//
// so the canvas shows the same HTML the host makes when it sends or saves.
//
// Resolves to { html, errors }: html is null when the source could not be
// compiled or the request failed, with the reasons in errors. Resolves to null
// when the request was aborted through options.signal.

// The engine mounted at /tess_edit; the editor's compileUrl value says
// otherwise, and a kit gets it as compileUrl
export const COMPILE_URL = "/tess_edit/compile"

export async function compile(source, { compiler, url = COMPILE_URL, signal } = {}) {
  if (!compiler) throw new Error("compile needs the name of a compiler")
  const token = document.querySelector("meta[name='csrf-token']")?.content
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
      body: JSON.stringify({ compiler, source }),
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
