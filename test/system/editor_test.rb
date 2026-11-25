require "application_system_test_case"

class EditorTest < ApplicationSystemTestCase
  setup do
    visit "/"
    within_canvas { assert_text "Thanks for your order" }
  end

  test "loads the sample and fills the hidden inputs" do
    eventually do
      assert_includes output("html"), "{% for line in order.lines %}"
      assert_includes output("html"), "{% if customer.orders_count == 1 %}"
      assert_equal "note", document_json["type"]
    end
    assert_no_match(/tess-/, output("html"))
  end

  test "selecting a block on the canvas shows it in Inspect" do
    within_canvas { canvas_block("View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
    assert_equal "View your order", setting("Label").value
  end

  test "changing a setting updates the canvas and the outputs" do
    within_canvas { canvas_block("View your order").click }
    setting("Label").fill_in(with: "Track {{ order.number }}")

    within_canvas { assert_selector "a", text: "Track {{ order.number }}" }
    eventually { assert_includes output("html"), "Track {{ order.number }}" }
  end

  test "editing text on the canvas" do
    within_canvas do
      canvas_block("We've received order").double_click
      find(".ProseMirror").send_keys(:end, " See you soon.")
      find(".ProseMirror").send_keys(:escape)
      assert_no_selector ".ProseMirror"
      assert_text "See you soon."
    end
    eventually { assert(blocks.any? { |type, text| type == "text" && text.to_s.include?("See you soon.") }) }
  end

  test "a link is added, changed and removed in a dialog" do
    within_canvas do
      canvas_block("We've received order").double_click
      select_all_text
    end
    find(".tess-edit button[title='Link']").click
    within("[role=dialog][aria-label='Add link']") do
      assert_no_button "Remove"
      fill_in "URL", with: "{{ order.url }}"
      click_on "Save"
    end
    within_canvas { assert_selector ".ProseMirror a[href='{{ order.url }}']" }

    find(".tess-edit button[title='Link']").click
    within("[role=dialog][aria-label='Edit link']") do
      assert_equal "{{ order.url }}", find_field("URL").value
      find_field("URL").send_keys(:escape)
    end
    assert_no_selector "[role=dialog]"
    within_canvas { assert_selector ".ProseMirror a[href='{{ order.url }}']" }

    find(".tess-edit button[title='Link']").click
    within("[role=dialog][aria-label='Edit link']") { click_on "Remove" }
    within_canvas { assert_no_selector ".ProseMirror a" }
  end

  test "clicking a tile adds the block after the selected one" do
    within_canvas { canvas_block("View your order").click }
    click_on "Spacer"

    eventually do
      types = blocks.map(&:first)
      assert_equal "spacer", types[types.index { |type| type == "button" } + 1]
    end
  end

  test "adding a block through an empty column's placeholder" do
    click_on "2 columns"
    within_canvas { first("[class*='tessph-']").click }
    within("[role=menu]") { click_on "Image" }

    eventually { assert_includes blocks.map(&:first), "image" }
    within_canvas { assert_selector "[class*='tessph-']", count: 1 }
  end

  test "the Add block menu closes on Escape, a click elsewhere and a second click" do
    click_on "2 columns"
    placeholder = -> { within_canvas { first("[class*='tessph-']").click } }

    placeholder.call
    assert_selector "[role=menu]"
    find("body").send_keys(:escape)
    assert_no_selector "[role=menu]"

    placeholder.call
    assert_selector "[role=menu]"
    within_canvas { canvas_block("Thanks for your order").click }
    assert_no_selector "[role=menu]"
    # A click on the placeholder right after the menu closed closes it, as the
    # second of two clicks on it; this one comes later, as a person's would
    sleep 0.5

    placeholder.call
    assert_selector "[role=menu]"
    placeholder.call
    assert_no_selector "[role=menu]"

    placeholder.call
    assert_selector "[role=menu]"
    click_on "Layers"
    assert_no_selector "[role=menu]"
  end

  test "dragging a block from the Blocks panel onto the canvas" do
    drag_tile_onto_canvas "Spacer", below: "View your order"

    eventually do
      types = blocks.map(&:first)
      assert_equal "spacer", types[types.index { |type| type == "button" } + 1]
    end
  end

  test "reordering blocks in the Layers tree" do
    click_on "Layers"
    button = find("[role=treeitem]", text: "Button · View your order")
    divider = find("[role=treeitem]", text: "Divider")
    button.drag_to(divider)

    eventually do
      types = blocks.map(&:first)
      assert_operator types.index("button"), :<, types.index("divider")
    end
  end

  test "undo and redo" do
    within_canvas { canvas_block("View your order").click }
    find(".tess-edit [title='Delete']", match: :first).click
    within_canvas { assert_no_text "View your order" }

    find("[title^='Undo']").click
    within_canvas { assert_text "View your order" }
    find("[title^='Redo']").click
    within_canvas { assert_no_text "View your order" }
  end

  test "preview shows the note as it is output, with its Liquid" do
    find("[title^='Preview']").click
    within_canvas do
      assert_text "{% for line in order.lines %}"
      assert_no_selector "[class*='tess-']"
    end
  end

  test "the code dialog loads JSON" do
    click_on "Code"
    json = find(".tess-edit textarea").value
    find(".tess-edit textarea").fill_in(with: json.sub("ACME STORE", "NEW NAME"))
    click_on "Load this JSON"

    within_canvas { assert_text "NEW NAME" }
  end

  test "a canvas the kit can't render shows why and keeps the last one" do
    # Puts an HTML block with this HTML at the end of the note, replacing the
    # one added before: the Note kit can't render a tag that isn't closed.
    set_raw_html = ->(html) do
      execute_script(<<~JS, html)
        const editor = document.querySelector("[data-controller='tess-edit']").tessEdit
        const doc = editor.getDocument()
        doc.children = doc.children.filter((node) => node.id !== "broken")
        doc.children.push({ id: "broken", type: "raw", attributes: {}, data: { html: arguments[0] }, children: [] })
        editor.setDocument(doc)
      JS
    end

    set_raw_html.call("<div>not closed")
    assert_selector "[role=alert]", text: "The note could not be rendered: <div> isn't closed in an HTML block"
    within_canvas { assert_text "Thanks for your order" }
    eventually { assert_equal "", output("html") }

    set_raw_html.call("<div>Closed now</div>")
    assert_no_selector "[role=alert]"
    within_canvas { assert_text "Closed now" }
  end

  test "an HTML block shows its HTML in Inspect" do
    execute_script(<<~JS)
      const editor = document.querySelector("[data-controller='tess-edit']").tessEdit
      const doc = editor.getDocument()
      doc.children.push({ id: "bhtml", type: "raw", attributes: {}, data: { html: "<p>Hand-written HTML</p>" }, children: [] })
      editor.setDocument(doc)
    JS
    within_canvas { find("p", text: "Hand-written HTML").click }

    assert_equal "<p>Hand-written HTML</p>", find("[data-tess-edit-panel='inspect'] textarea").value
    assert_selector "[data-tess-edit-panel='inspect'] pre .text-blue-700", text: "<p"
  end

  test "HTML is edited with indentation, and in a larger window" do
    execute_script(<<~JS)
      const editor = document.querySelector("[data-controller='tess-edit']").tessEdit
      const doc = editor.getDocument()
      doc.children.push({ id: "bhtml", type: "raw", attributes: {}, data: { html: "<div>Start</div>" }, children: [] })
      editor.setDocument(doc)
    JS
    within_canvas { find("div", text: "Start", exact_text: true, match: :first).click }
    type_at_end(find("[data-tess-edit-panel='inspect'] textarea"), :enter, :tab, "<p>Tabbed</p>")
    eventually { assert_equal "<div>Start</div>\n  <p>Tabbed</p>", raw_html }

    click_on "Expand"
    within("[role='dialog']") do
      assert_selector "h3", text: "HTML"
      type_at_end(find("textarea"), :enter, "<p>Bigger</p>")
    end
    eventually { assert_equal "<div>Start</div>\n  <p>Tabbed</p>\n  <p>Bigger</p>", raw_html }
    within_canvas { assert_text "Bigger" }

    find("[role='dialog'] textarea").send_keys(:escape)
    assert_no_selector "[role='dialog']"
    assert_equal "<div>Start</div>\n  <p>Tabbed</p>\n  <p>Bigger</p>", find("[data-tess-edit-panel='inspect'] textarea").value
  end

  test "combining the panels on one side" do
    assert_selector ".tess-edit aside", count: 2
    find("[title='All panels on the left']").click

    assert_selector ".tess-edit aside", count: 1
    assert_selector ".tess-edit aside + main"
    assert_no_selector "[data-tess-edit-panel='inspect']"

    # A click on the canvas opens the block in Inspect
    within_canvas { canvas_block("View your order").click }
    assert_equal "View your order", setting("Label").value
    click_on "Blocks"
    assert_no_selector "[data-tess-edit-panel='inspect']"

    find("[title='All panels on the right']").click
    assert_selector ".tess-edit main + aside"

    # The choice is remembered
    visit "/"
    assert_selector ".tess-edit main + aside"
    assert_selector ".tess-edit aside", count: 1

    find("[title='Blocks on the left, Inspect on the right']").click
    assert_selector ".tess-edit aside", count: 2
  end

  test "a narrow editor combines the panels on the left and splits them again when wide" do
    assert_selector ".tess-edit aside", count: 2
    original = page.current_window.size

    page.current_window.resize_to(900, original[1])
    assert_selector ".tess-edit aside", count: 1
    assert_selector ".tess-edit aside + main"
    assert_selector "[title='Too narrow to split the panels'][disabled]"
    within_canvas { canvas_block("View your order").click }
    assert_equal "View your order", setting("Label").value

    page.current_window.resize_to(*original)
    assert_selector ".tess-edit aside", count: 2
    assert_selector "[data-tess-edit-panel='inspect']"
    assert_nil page.evaluate_script("localStorage.getItem('tess_edit:panels')")
  ensure
    page.current_window.resize_to(*original) if original
  end

  test "a phone-width editor has its panels in a sheet below the canvas" do
    original = page.current_window.size
    page.current_window.resize_to(400, original[1])

    assert_no_selector ".tess-edit aside"
    assert_no_selector "[title='All panels on the left']"
    find("[title='Show panels']").click
    assert_selector ".tess-edit main + aside", count: 1
    assert_button "Inspect"

    find("[title='Hide panels']", match: :first).click
    assert_no_selector ".tess-edit aside"

    # A tap on a block opens the sheet on Inspect
    within_canvas { canvas_block("View your order").click }
    assert_equal "View your order", setting("Label").value

    page.current_window.resize_to(*original)
    assert_selector ".tess-edit aside", count: 2
    assert_selector "[title='Blocks on the left, Inspect on the right']"
  ensure
    page.current_window.resize_to(*original) if original
  end

  test "no stray null in the editor in any panel layout" do
    ["All panels on the left", "All panels on the right", "Blocks on the left, Inspect on the right"].each do |layout|
      find("[title='#{layout}']").click
      assert_no_text(/\bnull\b/)
    end
    within_canvas { canvas_block("We've received order").double_click }
    assert_selector "[title='Bold (⌘B)']"
    assert_no_text(/\bnull\b/)
  end

  test "the host page sets the default panel layout" do
    visit "/?panels=right"
    assert_selector ".tess-edit main + aside"
    click_on "Inspect"
    assert_selector ".tess-edit h2", text: "Note"
  end

  private

  # Selenium can't drag across into an iframe, so this sends the same drag
  # events the browser would: dragstart on the tile, dragover and drop on the
  # canvas, below the block with the given text.
  def drag_tile_onto_canvas(tile, below:)
    execute_script(<<~JS, tile, below, BLOCK)
      const [tileLabel, targetText] = arguments
      const tile = [...document.querySelectorAll(".tess-edit button[draggable]")].find((b) => b.textContent.trim() === tileLabel)
      const frame = document.querySelector("iframe[title='Note canvas']")
      const doc = frame.contentDocument
      const target = [...doc.querySelectorAll(arguments[2])].find((block) => block.textContent.includes(targetText))
      const rect = target.getBoundingClientRect()
      const at = { clientX: rect.left + rect.width / 2, clientY: rect.bottom - 2, bubbles: true, cancelable: true }
      const dataTransfer = new DataTransfer()
      tile.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }))
      const over = doc.elementFromPoint(at.clientX, at.clientY)
      over.dispatchEvent(new frame.contentWindow.DragEvent("dragover", { ...at, dataTransfer }))
      over.dispatchEvent(new frame.contentWindow.DragEvent("drop", { ...at, dataTransfer }))
      tile.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }))
    JS
  end

  def type_at_end(textarea, *keys)
    execute_script("arguments[0].focus(); arguments[0].setSelectionRange(arguments[0].value.length, arguments[0].value.length)", textarea)
    textarea.send_keys(*keys)
  end

  def raw_html
    document_json["children"].find { |node| node["id"] == "bhtml" }&.dig("data", "html")
  end

  test "a clicked tile that doesn't fit near the selection goes in the last block it fits in" do
    sections = -> { blocks_of(document_json, "section") }
    columns = sections.call.sum { |section| section["children"].size }
    # A column goes in a section, not in the note
    within(".tess-edit") { click_on "Column" }
    eventually do
      assert_equal %w[column column column], sections.call.last["children"].map { |child| child["type"] }
      assert_equal columns + 1, sections.call.sum { |section| section["children"].size }
    end
  end

  private

  def blocks_of(node, type)
    [(node if node["type"] == type), *Array(node["children"]).flat_map { |child| blocks_of(child, type) }].compact
  end
end
