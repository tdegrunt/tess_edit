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
