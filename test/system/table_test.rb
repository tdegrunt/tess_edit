require "application_system_test_case"

# A table in an email (blocks/table.js): an mj-table of HTML, edited from a
# selected cell, also in the demo's Note (a kit that takes it in)
class TableTest < ApplicationSystemTestCase
  def table = document_json.then { |doc| find_node(doc, "table") }

  def find_node(node, type)
    return node if node["type"] == type

    node["children"].each do |child|
      found = find_node(child, type)
      return found if found
    end
    nil
  end

  test "a table is added from the palette, and a cell adds rows and columns" do
    visit "/"
    within(".tess-edit") { click_on "Table" }
    within_canvas do
      assert_selector "thead th", count: 3
      # Its own rows, not the email's layout tables
      assert_selector "table > tbody > tr[class^='tess-']", count: 2
      first("table > tbody > tr[class^='tess-'] > td").click
    end

    click_on "Add right"
    click_on "Add below"
    within_canvas do
      assert_selector "thead th", count: 4
      assert_selector "table > tbody > tr[class^='tess-']", count: 3
    end
    fill_in "Column width", with: "80px"
    within_canvas { assert_selector "col[style='width:80px']" }

    eventually do
      assert_equal 4, table&.dig("data", "columns")&.size
      assert_includes output("html"), "<th style=\"border:1px solid #d1d5db"
    end
  end

  test "Tab goes to the next cell's text, Shift+Tab back, and from the last cell adds a row" do
    visit "/"
    within(".tess-edit") { click_on "Table" }
    within_canvas do
      first("thead th").double_click
      find(".ProseMirror").send_keys("Name", :tab)
      assert_selector "thead th:nth-child(2) .ProseMirror"
      find(".ProseMirror").send_keys("Price", [:shift, :tab])
      assert_selector "thead th:first-child .ProseMirror"

      # Through the rest, to the last cell, and on: a new row, editing its first cell
      8.times { find(".ProseMirror").send_keys(:tab) }
      assert_selector "table > tbody > tr[class^='tess-']:last-child > td:last-child .ProseMirror"
      find(".ProseMirror").send_keys(:tab)
      assert_selector "table > tbody > tr[class^='tess-']", count: 3
      assert_selector "table > tbody > tr[class^='tess-']:last-child > td:first-child .ProseMirror"
      find(".ProseMirror").send_keys("Total", :escape)
    end
    eventually do
      assert_includes output("html"), "Name"
      assert_includes output("html"), "Price"
      assert_includes output("html"), "Total"
    end
  end

  test "a cell's menu on the canvas adds rows and wraps its row in a Loop, marked by a bracket" do
    visit "/"
    within(".tess-edit") { click_on "Table" }
    within_canvas do
      all("table > tbody > tr[class^='tess-'] > td")[0].click
      find(".tess-tools [data-tool='table']").click
    end
    within("[data-tess-edit-menu='table']") { click_on "Add row below" }
    within_canvas do
      assert_selector "table > tbody > tr[class^='tess-']", count: 3
      # The first row's middle cell, not under the new cell's tools
      all("table > tbody > tr[class^='tess-'] > td")[1].click
      find(".tess-tools [data-tool='table']").click
    end
    within("[data-tess-edit-menu='table']") { click_on "Repeat the row in a Loop" }

    within_canvas { assert_selector ".tess-bracket", text: "For item in items" }
    eventually { assert_equal "loop", table&.dig("children", 1, "type") }
    # Selected, to fill in
    assert_text "For item in items"

    # Its bracket selects it again, from a cell
    within_canvas { all("table > tbody > tr[class^='tess-'] > td")[2].click }
    assert_no_text "For item in items"
    within_canvas { find(".tess-bracket").click }
    assert_text "For item in items"
  end

  test "a column's border is dragged to set its width" do
    visit "/"
    within(".tess-edit") { click_on "Table" }
    within_canvas { first("table > tbody > tr[class^='tess-'] > td").click }
    # Once the canvas has the table as it is, not written again under the drag
    assert_field "Column width"
    eventually { assert table }
    within_canvas do
      handle = first(".tess-column")
      page.driver.browser.action.click_and_hold(handle.native).move_by(40, 0).release.perform
    end
    eventually { assert_match(/\A\d+px\z/, table.dig("data", "columns", 0, "width")) }
    within_canvas { assert_selector "col[style^='width:']" }
  end

  test "the demo's Note has tables too" do
    visit "/?kit=note"
    within(".tess-edit") { click_on "Table" }
    within_canvas("Note") { assert_selector "thead th", count: 3 }
    eventually { assert_includes output("html"), "<thead>" }
  end
end
