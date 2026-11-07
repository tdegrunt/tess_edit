require "application_system_test_case"

class EditorTest < ApplicationSystemTestCase
  setup do
    visit "/"
    within_canvas { assert_text "Thanks for your order" }
  end

  test "loads the sample and fills the hidden inputs" do
    eventually do
      assert_includes output("html"), "{% for line in order.lines %}"
      assert_includes output("mjml"), "<mj-raw>{% if customer.orders_count == 1 %}</mj-raw>"
      assert_equal "root", document_json["type"]
    end
    assert_no_match(/tess-/, output("html"))
  end

  test "selecting a block on the canvas shows it in Inspect" do
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_selector ".tess-edit h2", text: "Button · View your order"
    assert_equal "View your order", setting("Label").value
  end

  test "changing a setting updates the canvas and the outputs" do
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    setting("Label").fill_in(with: "Track {{ order.number }}")

    within_canvas { assert_selector "a", text: "Track {{ order.number }}" }
    eventually { assert_includes output("html"), "Track {{ order.number }}" }
  end

  test "editing text on the canvas" do
    within_canvas do
      find("td[class^='tess-']", text: "We've received order").double_click
      find(".ProseMirror").send_keys(:end, " See you soon.")
      find(".ProseMirror").send_keys(:escape)
      assert_no_selector ".ProseMirror"
      assert_text "See you soon."
    end
    eventually { assert(blocks.any? { |type, text| type == "text" && text.to_s.include?("See you soon.") }) }
  end

  test "clicking a tile adds the block after the selected one" do
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
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
    within_canvas { find("td[class^='tess-']", text: "Thanks for your order", match: :first).click }
    assert_no_selector "[role=menu]"

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
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    find(".tess-edit [title='Delete']", match: :first).click
    within_canvas { assert_no_text "View your order" }

    find("[title^='Undo']").click
    within_canvas { assert_text "View your order" }
    find("[title^='Redo']").click
    within_canvas { assert_no_text "View your order" }
  end

  test "preview shows the email as sent" do
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

  test "MJML that can't be compiled shows why and keeps the last email on the canvas" do
    # Puts an HTML block with this HTML at the end of the email, replacing the one added before.
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
    assert_selector "[role=alert]", text: "The email could not be compiled"
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
  end

  test "combining the panels on one side" do
    assert_selector ".tess-edit aside", count: 2
    find("[title='All panels on the left']").click

    assert_selector ".tess-edit aside", count: 1
    assert_selector ".tess-edit aside + main"
    assert_no_selector "[data-tess-edit-panel='inspect']"

    # A click on the canvas opens the block in Inspect
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
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
    within_canvas { find("td[class^='tess-']", text: "View your order").click }
    assert_equal "View your order", setting("Label").value

    page.current_window.resize_to(*original)
    assert_selector ".tess-edit aside", count: 2
    assert_selector "[data-tess-edit-panel='inspect']"
    assert_nil page.evaluate_script("localStorage.getItem('tess_edit:panels')")
  ensure
    page.current_window.resize_to(*original) if original
  end

  test "no stray null in the editor in any panel layout" do
    ["All panels on the left", "All panels on the right", "Blocks on the left, Inspect on the right"].each do |layout|
      find("[title='#{layout}']").click
      assert_no_text(/\bnull\b/)
    end
    within_canvas { find("td[class^='tess-']", text: "We've received order").double_click }
    assert_selector "[title='Bold (⌘B)']"
    assert_no_text(/\bnull\b/)
  end

  test "the host page sets the default panel layout" do
    visit "/?panels=right"
    assert_selector ".tess-edit main + aside"
    click_on "Inspect"
    assert_selector ".tess-edit h2", text: "Root"
  end

  private

  # Selenium can't drag across into an iframe, so this sends the same drag
  # events the browser would: dragstart on the tile, dragover and drop on the
  # canvas, below the block with the given text.
  def drag_tile_onto_canvas(tile, below:)
    execute_script(<<~JS, tile, below)
      const [tileLabel, targetText] = arguments
      const tile = [...document.querySelectorAll(".tess-edit button[draggable]")].find((b) => b.textContent.trim() === tileLabel)
      const frame = document.querySelector("iframe[title='Email canvas']")
      const doc = frame.contentDocument
      const target = [...doc.querySelectorAll("td[class^='tess-']")].find((td) => td.textContent.includes(targetText))
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
end
