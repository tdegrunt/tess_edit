import { test } from "node:test"
import assert from "node:assert/strict"
import { highlightCss, highlightHtml } from "tess_edit/ui/code_input"

// The colored copy must hold exactly the textarea's text, or the caret drifts
const text = (html) => html.replace(/<span class="[^"]*">|<\/span>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

const SAMPLES = [
  '<p style="margin:0">Hallo {{ task.contact.first_name }},</p>',
  '<span {% if late > 0 %}style="color: red"{% endif %}>{{ a | default: "<b>" }}</span>',
  '<a href="{{ url }}" data-x=\'1 > 0\'>Link &amp; more</a>\n<!-- a <comment> -->\n<br/>',
  "<div class=\"unfinished",
  "{% for line in order.lines %}\n  <td>{{ line.total | money }}</td>\n{% endfor %}",
  "a < b & c > d"
]

test("highlighted HTML holds exactly the original text", () => {
  for (const sample of SAMPLES) assert.equal(text(highlightHtml(sample)), sample)
})

test("highlighted CSS holds exactly the original text", () => {
  const css = '@media (max-width: 480px) {\n  .tess p { color: #111827; margin: 0 !important; font-family: "Inter", sans-serif }\n}\n/* {{ brand }} */'
  assert.equal(text(highlightCss(css)), css)
})

test("tags, attributes, strings and Liquid are colored", () => {
  const html = highlightHtml('<a href="{{ url }}">{% if x %}Go{% endif %}</a>')
  assert.match(html, /<span class="text-blue-700">&lt;a<\/span>/)
  assert.match(html, /<span class="text-amber-700">href<\/span>/)
  assert.match(html, /<span class="text-green-700">"<span class="text-purple-700">\{\{ url \}\}<\/span>"<\/span>/)
  assert.match(html, /<span class="text-purple-700">\{% if x %\}<\/span>Go/)
})

test("text between tags is escaped, not colored", () => {
  assert.equal(highlightHtml("a < b"), "a &lt; b")
})
