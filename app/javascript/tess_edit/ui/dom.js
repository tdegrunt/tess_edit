// A tiny element builder: h("button", { class: "…", onclick: fn }, "Label", child)

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue
    if (name.startsWith("on") && typeof value === "function") {
      element.addEventListener(name.slice(2).toLowerCase(), value)
    } else if (name === "html") {
      element.innerHTML = value
    } else if (name === "dataset") {
      Object.assign(element.dataset, value)
    } else if (name === "value" || (name in element && typeof value !== "string")) {
      // A textarea ignores a value attribute, so values are always set as the property
      element[name] = value
    } else {
      element.setAttribute(name, value === true ? "" : value)
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    element.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return element
}

export function debounce(fn, wait) {
  let timer
  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

// Puts items into parent in this order. Kept elements (a Set) are never
// taken out: they are hidden when not among the items and stay where they
// are when they are, with the other items put around them. Moving an element
// reconnects the Stimulus controllers inside it, which is what keeping
// avoids. Any other child goes.
export function place(parent, items, kept = new Set()) {
  const wanted = new Set(items)
  for (const child of [...parent.children]) {
    if (wanted.has(child)) continue
    if (kept.has(child)) child.hidden = true
    else child.remove()
  }
  let previous = null
  for (const item of items) {
    if (kept.has(item)) item.hidden = false
    if (item.parentNode !== parent) previous ? previous.after(item) : parent.prepend(item)
    previous = item
  }
}

// Writes the values of the fields in element into their attributes, for
// when it has to move: controllers that copy markup (outerHTML) as they
// reconnect, like Satis's toggle, then keep what was typed and chosen.
export function freeze(element) {
  element.querySelectorAll("input, textarea, select").forEach((field) => {
    if (field.tagName === "SELECT") [...field.options].forEach((option) => option.toggleAttribute("selected", option.selected))
    else if (field.tagName === "TEXTAREA") field.textContent = field.value
    else if (["checkbox", "radio"].includes(field.type)) field.toggleAttribute("checked", field.checked)
    else if (field.type !== "file") field.setAttribute("value", field.value)
  })
}
