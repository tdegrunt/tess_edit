// Node module loader that resolves bare specifiers the way the browser import map does:
// "tess_edit/..." to app/javascript, and the pins in config/importmap.rb to vendor/javascript.
// Loaded through register.mjs: `npm test`.
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { pathToFileURL, fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const pins = {}
for (const line of readFileSync(path.join(root, "config/importmap.rb"), "utf8").split("\n")) {
  const match = line.match(/^pin "([^"]+)"(?:, to: "([^"]+)")?/)
  if (match) pins[match[1]] = match[2] || `${match[1]}.js`
}

function resolve(specifier, context, next) {
  const vendored = pins[specifier] && path.join(root, "vendor/javascript", pins[specifier])
  if (vendored && existsSync(vendored)) return { url: pathToFileURL(vendored).href, shortCircuit: true }
  if (specifier === "tess_edit" || specifier.startsWith("tess_edit/")) {
    const rest = specifier === "tess_edit" ? "index" : specifier.slice("tess_edit/".length)
    return { url: pathToFileURL(path.join(root, "app/javascript/tess_edit", `${rest}.js`)).href, shortCircuit: true }
  }
  return next(specifier, context)
}

registerHooks({ resolve })
