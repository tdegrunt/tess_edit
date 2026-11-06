// Bundles the editor's third-party JavaScript into one ESM file per library, so
// importmap can pin them without chasing CDN chunk files.
import { build } from "esbuild"
import { readFileSync } from "node:fs"

const out = new URL("../../vendor/javascript/tess_edit/", import.meta.url).pathname
const version = (name) => JSON.parse(readFileSync(new URL(`node_modules/${name}/package.json`, import.meta.url))).version

const bundles = {
  "tiptap.js": {
    banner: `@tiptap/core ${version("@tiptap/core")}, @tiptap/starter-kit, @tiptap/extension-text-align, @tiptap/extension-text-style (MIT)`,
    contents: [
      'export { Editor, Extension, Mark, Node, mergeAttributes } from "@tiptap/core"',
      'export { StarterKit } from "@tiptap/starter-kit"',
      'export { TextAlign } from "@tiptap/extension-text-align"',
      'export { TextStyle, Color, FontSize, FontFamily } from "@tiptap/extension-text-style"'
    ].join("\n")
  }
}

for (const [file, { banner, contents }] of Object.entries(bundles)) {
  await build({
    stdin: { contents, resolveDir: new URL(".", import.meta.url).pathname, loader: "js" },
    bundle: true,
    format: "esm",
    minify: true,
    target: "es2020",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
    banner: { js: `/* ${banner}. Built by script/vendor/build.mjs */` },
    outfile: out + file,
    logLevel: "warning"
  })
  console.log(`wrote vendor/javascript/tess_edit/${file}`)
}
