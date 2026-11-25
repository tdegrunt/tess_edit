require "application_system_test_case"

# The panes either side of the canvas, whose tabs are dragged from one to the
# other, and the canvas's zoom
class PanesAndZoomTest < ApplicationSystemTestCase
  setup do
    visit "/"
    within_canvas { assert_text "Thanks for your order" }
  end

  test "a tab dragged to the other pane opens there, and stays there" do
    drag_tab "Layers", to: "[data-tess-edit-pane='right'] [role='tablist']"

    within("[data-tess-edit-pane='right']") do
      assert_selector "[role='tab'][aria-selected='true']", text: "Layers"
      assert_selector "[role='tab']", text: "Inspect"
    end
    within("[data-tess-edit-pane='left']") { assert_no_selector "[role='tab']", text: "Layers" }
    assert_selector "[title='Blocks on the left, Inspect on the right'][class*='bg-white']"

    visit "/"
    within("[data-tess-edit-pane='right']") { assert_selector "[role='tab']", text: "Layers" }

    # A click on the canvas opens Inspect in its pane
    within_canvas { canvas_block("View your order").click }
    within("[data-tess-edit-pane='right']") { assert_selector "[role='tab'][aria-selected='true']", text: "Inspect" }
    assert_equal "View your order", setting("Label").value
  end

  test "a tab dragged to a side without a pane makes one there" do
    find("[title='All panels on the right']").click
    assert_selector ".tess-edit aside", count: 1

    drag_tab "Blocks", to: "[data-tess-edit-drop-zone='left']"
    assert_selector ".tess-edit aside", count: 2
    within("[data-tess-edit-pane='left']") { assert_selector "[role='tab'][aria-selected='true']", text: "Blocks" }
    within("[data-tess-edit-pane='right']") { assert_no_selector "[role='tab']", text: "Blocks" }
    assert_no_selector "[data-tess-edit-drop-zone]"
  end

  test "the canvas zooms in steps, back to 100%, and to fit, and is still edited zoomed" do
    click_on "Zoom in (⌘+)"
    assert_selector ZOOM, text: "110%"
    assert_includes frame_style, "scale(1.1)"

    find(".tess-edit").send_keys([:control, "-"], [:control, "-"])
    assert_selector ZOOM, text: "90%"

    find(".tess-edit").send_keys([:control, "0"])
    assert_selector ZOOM, text: "100%"
    assert_not_includes frame_style, "scale"

    find(ZOOM).click
    assert_no_selector ZOOM, text: "100%"
    assert_operator find(ZOOM).text.to_i, :<, 100

    within_canvas { canvas_block("View your order").click }
    assert_equal "View your order", setting("Label").value
  end

  private

  ZOOM = "[data-tess-edit-zoom]"

  def frame_style
    find("iframe[title='Note canvas']")[:style].to_s
  end

  # Sends the drag events a browser would (Selenium's drag and drop doesn't
  # fire HTML5 ones): dragstart on the tab, dragover and drop on the target
  def drag_tab(label, to:)
    execute_script(<<~JS, label, to)
      const [label, selector] = arguments
      const tab = [...document.querySelectorAll(".tess-edit [role='tab']")].find((button) => button.textContent.trim() === label)
      const data = new DataTransfer()
      tab.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }))
      const target = document.querySelector(selector)
      const rect = target.getBoundingClientRect()
      const at = { bubbles: true, cancelable: true, dataTransfer: data, clientX: rect.right - 2, clientY: rect.top + rect.height / 2 }
      target.dispatchEvent(new DragEvent("dragover", at))
      target.dispatchEvent(new DragEvent("drop", at))
      tab.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }))
    JS
  end
end
