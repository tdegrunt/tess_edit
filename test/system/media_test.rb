require "application_system_test_case"

class MediaTest < ApplicationSystemTestCase
  setup do
    FileUtils.rm_rf(Rails.root.join("tmp/media"))
    visit "/?media=1"
    within_canvas { find("img[src*='Welcome']").click }
    assert_selector ".tess-edit h2", text: "Image"
  end

  teardown do
    FileUtils.rm_rf(Rails.root.join("tmp/media"))
  end

  def image_node
    blocks_of(document_json).find { |node| node["type"] == "image" }
  end

  # The first section, with the store's name
  def section_node
    blocks_of(document_json).find { |node| node["type"] == "section" }
  end

  def blocks_of(node)
    [node] + Array(node["children"]).flat_map { |child| blocks_of(child) }
  end

  test "an image with a URL shows it, and can switch to an uploaded image" do
    assert_equal "https://placehold.co/600x400/dbeafe/1e3a8a.png?text=Welcome", setting("Image").value

    click_on "Uploaded"
    setting("Image").select("Sample")

    within_canvas { assert_selector "img[src*='text=Sample']" }
    eventually { assert_equal "sample", image_node.dig("data", "image") }
    assert_no_selector "[data-tess-edit-panel='inspect'] input[type='text'][value*='Welcome']"
  end

  test "uploading an image puts it in the block" do
    click_on "Uploaded"
    find("[data-tess-edit-panel='inspect'] input[type='file']", visible: :all).attach_file(file_fixture("logo.png"), make_visible: true)

    within_canvas { assert_selector "img[src*='/media/']" }
    eventually { assert_match(/logo\.png\z/, image_node.dig("data", "image")) }
    assert_match(/logo\.png\z/, setting("Image").value)
  end

  test "dropping an image file on an Image block uploads it there" do
    drop_file("img[src*='Welcome']", file_fixture("logo.png"))

    within_canvas { assert_selector "img[src*='/media/']" }
    eventually { assert_match(/logo\.png\z/, image_node.dig("data", "image")) }
    assert_equal "upload", image_node.dig("data", "source")
    assert_match(/logo\.png\z/, setting("Image").value)
  end

  test "a section's background can be one of the host's images" do
    within_canvas { find("div", text: "ACME STORE", exact_text: true, match: :first).click }
    2.times { click_on_tool "Select parent" }
    assert_selector ".tess-edit h2", text: "Section"

    within(field_of("Background image")) do
      click_on "Uploaded"
      find("select").select("Sample")
    end

    eventually { assert_equal "sample", section_node.dig("data", "background") }
    assert_match(/text=Sample/, section_node.dig("attributes", "background-url"))
    within_canvas { assert_selector "[style*='text=Sample']" }
  end

  test "dropping an image file elsewhere in a section makes it the section's background" do
    drop_file("div", file_fixture("logo.png"), text: "ACME STORE")

    eventually { assert_match(/logo\.png\z/, section_node.dig("data", "background")) }
    assert_match(%r{/media/}, section_node.dig("attributes", "background-url"))
    assert_equal "upload", section_node.dig("data", "backgroundSource")
    within_canvas { assert_selector "[style*='/media/']" }
  end

  private

  def click_on_tool(title)
    find(".tess-edit button[title='#{title}']").click
  end

  def field_of(label)
    find("[data-tess-edit-panel='inspect'] span", text: label, exact_text: true).find(:xpath, "..")
  end

  # Drops a file on an element in the canvas, as when it's dragged from the desktop
  def drop_file(selector, path, text: nil)
    within_canvas do
      target = text ? find(selector, text: text, exact_text: true, match: :first) : find(selector)
      execute_script(<<~JS, target, path.basename.to_s, Base64.strict_encode64(path.binread))
        const [target, name, data] = arguments
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        const transfer = new DataTransfer()
        transfer.items.add(new File([bytes], name, { type: "image/png" }))
        for (const type of ["dragover", "drop"]) {
          target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
        }
      JS
    end
  end
end
