// Every English text the editor can show (see core/i18n.js): its blocks' and
// kits' names, groups, labels, hints, placeholders and options, its categories,
// and the first argument of each t("…") in its source. config/locales/en.yml
// has a key for each (i18n_test.js).
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { KIT_ERRORS, blockTypes, categories, getBlock, kits } from "tess_edit/core/registry"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const source = path.join(root, "app/javascript/tess_edit")

function definitionWords() {
  const words = []
  const add = (...texts) => texts.forEach((text) => typeof text === "string" && text && words.push(text))
  for (const type of blockTypes()) {
    const block = getBlock(type)
    add(block.name, block.hint)
    block.palette.forEach((item) => add(item.label))
    for (const group of block.fields || []) {
      add(group.title)
      for (const field of group.fields) {
        add(field.label, field.hint, field.placeholder)
        if (Array.isArray(field.options)) field.options.forEach((option) => add(option?.label))
        field.item?.forEach((part) => add(part.label))
      }
    }
  }
  categories().forEach((category) => add(category.label))
  kits().forEach((kit) => {
    add(kit.name, kit.previewTitle, kit.errors, ...Object.values(kit.notes || {}))
    kit.devices?.forEach((device) => add(device.title))
  })
  add(KIT_ERRORS)
  return words
}

// The string literals in a t(…) call's first argument, but what it's compared with (context === "body")
function sourceWords() {
  const words = []
  for (const file of readdirSync(source, { recursive: true }).filter((name) => name.endsWith(".js"))) {
    const text = readFileSync(path.join(source, file), "utf8")
    for (const match of text.matchAll(/\bt\(/g)) {
      let depth = 0
      for (let i = match.index + 2; i < text.length; i++) {
        const char = text[i]
        if (char === '"') {
          const end = text.indexOf('"', i + 1)
          if (depth === 0 && !/[=!]==?\s*$/.test(text.slice(match.index, i))) words.push(JSON.parse(text.slice(i, end + 1)))
          i = end
        } else if ("([{".includes(char)) depth++
        else if (")]}".includes(char)) {
          if (depth === 0) break
          depth--
        } else if (char === "," && depth === 0) break
      }
    }
  }
  return words
}

// A text with words, not a CSS value given as a placeholder (600px, 1px solid #e5e7eb)
export const words = (text) => /[a-z]{2}/i.test(text) && !/^[\d.]+(px|pt|mm|em|rem|%)?$|#[\da-f]{3}/i.test(text)

export function editorWords() {
  return [...new Set([...definitionWords(), ...sourceWords()])].filter(words).sort()
}

// The English in a locale file's tess_edit.editor scope, each a double-quoted value
export function localeWords(file) {
  return readFileSync(path.join(root, file), "utf8").split("\n").map((line) => line.match(/^ {6}[\w]+: (".*")$/)?.[1]).filter(Boolean).map((value) => JSON.parse(value))
}
