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

  test "the demo's Note has tables too" do
    visit "/?kit=note"
    within(".tess-edit") { click_on "Table" }
    within_canvas("Note") { assert_selector "thead th", count: 3 }
    eventually { assert_includes output("html"), "<thead>" }
  end
end
