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

  def blocks_of(node)
    [node] + Array(node["children"]).flat_map { |child| blocks_of(child) }
  end

  test "an image with a URL shows it, and can switch to an uploaded image" do
    assert_equal "https://placehold.co/600x400/dbeafe/1e3a8a.png?text=Welcome", setting("Image URL").value

    click_on "Uploaded"
    setting("Image").select("Sample")

    within_canvas { assert_selector "img[src*='text=Sample']" }
    eventually { assert_equal "sample", image_node.dig("data", "image") }
    assert_no_selector "[data-tess-edit-panel='inspect'] span", text: "Image URL", exact_text: true
  end

  test "uploading an image puts it in the block" do
    click_on "Uploaded"
    find("[data-tess-edit-panel='inspect'] input[type='file']", visible: :all).attach_file(file_fixture("logo.png"), make_visible: true)

    within_canvas { assert_selector "img[src*='/media/']" }
    eventually { assert_match(/logo\.png\z/, image_node.dig("data", "image")) }
    assert_match(/logo\.png\z/, setting("Image").value)
  end
end
