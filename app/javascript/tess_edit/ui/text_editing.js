// Inline rich-text editing with Tiptap, mounted inside the canvas iframe on the
// text block's own element, plus the formatting toolbar above the canvas. With
// the host's variables (`menu`, a ui/variable_menu.js VariableMenu) typing {{
// suggests them, and the toolbar's { } button browses them.

import { Color, Editor, StarterKit, TextAlign, TextStyle } from "tess_edit/vendor/tiptap"
import { h } from "tess_edit/ui/dom"
import { icon } from "tess_edit/ui/icons"

const BUTTON = "w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
const ACTIVE = "bg-blue-50 text-blue-700"

export class TextEditing {
  constructor(toolbar, { menu = null } = {}) {
    this.toolbar = toolbar
    this.menu = menu
    this.tiptap = null
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
        TextAlign.configure({ types: ["heading", "paragraph"] })
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
    const separator = () => h("span", { class: "mx-1 h-5 w-px bg-gray-200" })

    const level = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }))
    const style = h(
      "select",
      {
        class: "h-7 rounded-md border border-gray-300 bg-white px-1.5 text-xs text-gray-800",
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
      class: "h-7 w-8 cursor-pointer rounded border border-gray-300 bg-white p-0.5",
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
      button("link", "Link", editor.isActive("link"), () => {
        const previous = editor.getAttributes("link").href || "https://"
        const href = window.prompt("Link URL (Liquid allowed, e.g. {{ order.url }})", previous)
        if (href === null) return
        href ? chain().extendMarkRange("link").setLink({ href }).run() : chain().extendMarkRange("link").unsetLink().run()
      }),
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
      this.menu
        ? h("button", {
          type: "button",
          title: "Insert a variable",
          class: `${BUTTON} w-auto px-1.5 font-mono text-xs`,
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
