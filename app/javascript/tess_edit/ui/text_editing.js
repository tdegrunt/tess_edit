// Inline rich-text editing with Tiptap, mounted inside the canvas iframe on the
// text block's own element, plus the formatting toolbar above the canvas. With
// the host's variables (`menu`, a ui/variable_menu.js VariableMenu) typing {{
// suggests them, and the toolbar's { } button browses them. With the host's
// translations (`editor.translations`, core/translations.js) a t filter shows
// its text in the editor's language until the caret goes into it, and the
// toolbar turns selected text into a translation.

import { Color, Decoration, DecorationSet, Editor, Extension, Plugin, PluginKey, StarterKit, TextAlign, TextStyle } from "tess_edit/vendor/tiptap"
import { missingArguments, translationCalls } from "tess_edit/core/translations"
import { showText } from "tess_edit/ui/canvas"
import { askText } from "tess_edit/ui/dialog"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const BUTTON = "w-7 h-7 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
const ACTIVE = "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
const TRANSLATIONS = new PluginKey("tessTranslations")

export class TextEditing {
  constructor(toolbar, { menu = null, editor = null } = {}) {
    this.toolbar = toolbar
    this.menu = menu
    this.editor = editor
    this.tiptap = null
  }

  get translating() {
    return Boolean(this.editor?.translations?.enabled)
  }

  get active() {
    return !!this.tiptap
  }

  // scope: the loop variables of the block (core/variables.js loopScope)
  start(container, content, onUpdate, { scope = [] } = {}) {
    this.stop()
    container.replaceChildren()
    this.tiptap = new Editor({
      element: container,
      content: content || { type: "doc", content: [{ type: "paragraph" }] },
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          heading: { levels: [1, 2, 3] },
          // Liquid in links ({{ url }}) is fine: do not filter URLs.
          link: { openOnClick: false, autolink: false, linkOnPaste: true, isAllowedUri: () => true }
        }),
        TextStyle,
        Color,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        ...(this.translating ? [translationsExtension(this)] : [])
      ],
      autofocus: "end",
      editorProps: { handleKeyDown: (view, event) => this.menu?.key(event) || false },
      onUpdate: ({ editor, transaction }) => {
        onUpdate(editor.getJSON())
        if (this.menu && !transaction.getMeta("variable")) this.menu.suggest(this.adapter)
      },
      onSelectionUpdate: () => this.menu?.open && !this.menu.state?.browse && this.menu.suggest(this.adapter),
      onBlur: () => this.menu?.open && !this.menu.state?.browse && this.menu.close(),
      onTransaction: () => this.renderToolbar()
    })
    this.adapter = this.menu && tiptapAdapter(this.tiptap, scope)
    this.renderToolbar()
    return this.tiptap
  }

  // Again, when the translations or the editor's language change
  refreshTranslations() {
    if (this.tiptap && this.translating) this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta(TRANSLATIONS, true))
  }

  // Keeps the selected text as a translation (see the editor's
  // makeTranslatable) and puts its t filter in its place
  async makeTranslatable() {
    const tiptap = this.tiptap
    const { selection, doc } = tiptap.state
    if (selection.empty) return this.editor.flash("Select the text to translate first.")
    // Inside the text: a selection of everything starts before the first paragraph
    const from = Math.max(selection.from, 1)
    const to = Math.min(selection.to, doc.content.size - 1)
    const tag = await this.editor.makeTranslatable(doc.textBetween(from, to, " "))
    if (!tag || this.tiptap !== tiptap) return
    tiptap.view.dispatch(tiptap.state.tr.insertText(tag, from, to))
    // After it, so its text shows
    tiptap.chain().focus().setTextSelection(from + tag.length).run()
  }

  // The selected text's link, in a dialog: an empty URL removes it
  async editLink() {
    const tiptap = this.tiptap
    const previous = tiptap.getAttributes("link").href
    const href = await askText(this.editor.root, {
      title: previous ? "Edit link" : "Add link",
      label: "URL",
      value: previous || "https://",
      hint: "Liquid is allowed, e.g. {{ order.url }}",
      remove: Boolean(previous)
    })
    if (href === null || this.tiptap !== tiptap) return tiptap.commands.focus()
    const chain = tiptap.chain().focus().extendMarkRange("link")
    href ? chain.setLink({ href }).run() : chain.unsetLink().run()
  }

  stop() {
    if (!this.tiptap) return null
    const json = this.tiptap.getJSON()
    this.menu?.close()
    this.tiptap.destroy()
    this.tiptap = null
    this.toolbar.replaceChildren()
    this.toolbar.classList.add("hidden")
    return json
  }

  renderToolbar() {
    const editor = this.tiptap
    if (!editor) return
    const chain = () => editor.chain().focus()
    const button = (name, title, active, run) =>
      h("button", {
        type: "button",
        title,
        class: `${BUTTON} ${active ? ACTIVE : ""}`,
        html: icon(name),
        onmousedown: (event) => event.preventDefault(),
        onclick: run
      })
    const separator = () => h("span", { class: "mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" })

    const level = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }))
    const style = h(
      "select",
      {
        class: "h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-0 pl-1.5 pr-7 text-xs text-gray-800 dark:text-gray-200",
        title: "Paragraph style",
        onchange: (event) => {
          const value = Number(event.target.value)
          value ? chain().setHeading({ level: value }).run() : chain().setParagraph().run()
        }
      },
      h("option", { value: "0", selected: !level }, "Paragraph"),
      [1, 2, 3].map((l) => h("option", { value: String(l), selected: level === l }, `Heading ${l}`))
    )

    const currentColor = editor.getAttributes("textStyle").color
    const color = h("input", {
      type: "color",
      title: "Text color",
      class: "h-7 w-8 cursor-pointer rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-0.5",
      value: /^#[0-9a-f]{6}$/i.test(currentColor || "") ? currentColor : "#000000",
      onchange: (event) => chain().setColor(event.target.value).run()
    })

    this.toolbar.replaceChildren(...[
      style,
      separator(),
      button("bold", "Bold (⌘B)", editor.isActive("bold"), () => chain().toggleBold().run()),
      button("italic", "Italic (⌘I)", editor.isActive("italic"), () => chain().toggleItalic().run()),
      button("underline", "Underline (⌘U)", editor.isActive("underline"), () => chain().toggleUnderline().run()),
      button("strike", "Strikethrough", editor.isActive("strike"), () => chain().toggleStrike().run()),
      color,
      separator(),
      button("link", "Link", editor.isActive("link"), () => this.editLink()),
      editor.isActive("link") ? button("unlink", "Remove link", false, () => chain().extendMarkRange("link").unsetLink().run()) : null,
      separator(),
      button("align-left", "Align left", editor.isActive({ textAlign: "left" }), () => chain().setTextAlign("left").run()),
      button("align-center", "Align center", editor.isActive({ textAlign: "center" }), () => chain().setTextAlign("center").run()),
      button("align-right", "Align right", editor.isActive({ textAlign: "right" }), () => chain().setTextAlign("right").run()),
      separator(),
      button("list-bullet", "Bulleted list", editor.isActive("bulletList"), () => chain().toggleBulletList().run()),
      button("list-ordered", "Numbered list", editor.isActive("orderedList"), () => chain().toggleOrderedList().run()),
      separator(),
      button("clear", "Clear formatting", false, () => chain().unsetAllMarks().clearNodes().run()),
      this.translating ? button("translate", "Make translatable: keep the selected text as a translation", false, () => this.makeTranslatable()) : null,
      this.menu && this.editor?.variables?.enabled
        ? h("button", {
          type: "button",
          title: "Insert a variable",
          class: `${BUTTON.replace("w-7", "px-1.5")} whitespace-nowrap font-mono text-xs`,
          onmousedown: (event) => event.preventDefault(),
          onclick: (event) => this.menu.browse(this.adapter, event.currentTarget)
        }, "{ }")
        : null
    ].filter(Boolean))
    this.toolbar.classList.remove("hidden")
  }
}

// A variable menu adapter for Tiptap (see ui/variable_menu.js): offsets are in
// the paragraph with the caret, in which every character and inline node
// takes one position.
function tiptapAdapter(editor, scope) {
  const text = ($pos, from, to) => $pos.parent.textBetween(from, to, undefined, "\ufffc")
  const dispatch = (from, to, value) => {
    editor.view.dispatch(editor.state.tr.insertText(value, from, to).setMeta("variable", true))
    editor.view.focus()
  }
  return {
    mode: "output",
    scope,
    before: () => text(editor.state.selection.$from, 0, editor.state.selection.$from.parentOffset),
    after: () => {
      const $to = editor.state.selection.$to
      return text($to, $to.parentOffset, $to.parent.content.size)
    },
    replace(start, end, value) {
      const base = editor.state.selection.$from.start()
      dispatch(base + start, base + end, value)
    },
    insert(value) {
      const { from, to } = editor.state.selection
      dispatch(from, to, value)
    },
    // The caret's place in the iframe, in the page's viewport
    rect() {
      const caret = editor.view.coordsAtPos(editor.state.selection.from)
      const frame = editor.view.dom.ownerDocument.defaultView.frameElement?.getBoundingClientRect() || { left: 0, top: 0 }
      return { left: caret.left + frame.left, right: caret.right + frame.left, top: caret.top + frame.top, bottom: caret.bottom + frame.top }
    }
  }
}

// Shows each t filter's text in the editor's language, in place of its Liquid,
// unless the caret or selection is inside it or it has no text there: then
// the Liquid shows, marked (red when a language is missing). Pointing at
// either lists every language (TranslationPopover, see Canvas#listen).
function translationsExtension(editing) {
  return Extension.create({
    name: "tessTranslations",
    addProseMirrorPlugins() {
      return [new Plugin({ key: TRANSLATIONS, props: { decorations: (state) => translationDecorations(state, editing) } })]
    }
  })
}

function translationDecorations(state, editing) {
  const { translations, translationLocale } = editing.editor
  const { from, to } = state.selection
  const decorations = []
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Every character and inline node takes one position
    const text = node.textBetween(0, node.content.size, undefined, "\ufffc")
    for (const call of translationCalls(text)) {
      const start = pos + 1 + call.start
      const end = pos + 1 + call.end
      const locale = call.locale || translationLocale
      const value = locale ? translations.value(call.key, locale) : null
      const unfilled = value === null ? [] : missingArguments(value, call)
      const missing = unfilled.length > 0 || (translations.has(call.key) && (locale ? value === null : translations.missing(call.key).length > 0))
      if ((from < end && to > start) || value === null) {
        decorations.push(Decoration.inline(start, end, { class: `tess-t-raw${missing ? " tess-t-missing" : ""}`, "data-tess-key": call.key }))
      } else {
        decorations.push(Decoration.inline(start, end, { class: "tess-t-hidden" }))
        const caret = start + call.text.indexOf(call.key) + call.key.length
        decorations.push(Decoration.widget(start, (view) => translationChip(view, call.key, value, unfilled, () => editing.tiptap?.chain().focus().setTextSelection(caret).run()), { side: -1, key: `t:${call.key}:${value}:${unfilled}`, ignoreSelection: true }))
      }
    }
    return false
  })
  return DecorationSet.create(state.doc, decorations)
}

function translationChip(view, key, value, unfilled, edit) {
  const chip = view.dom.ownerDocument.createElement("span")
  chip.className = unfilled.length ? "tess-t tess-t-missing" : "tess-t"
  chip.contentEditable = "false"
  chip.dataset.tessKey = key
  if (unfilled.length) chip.title = `No argument for ${unfilled.map((name) => `%{${name}}`).join(", ")} in the t filter`
  showText(chip, value)
  chip.addEventListener("mousedown", (event) => {
    event.preventDefault()
    edit()
  })
  return chip
}
