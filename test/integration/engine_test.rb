require "test_helper"

class EngineTest < ActionDispatch::IntegrationTest
  test "the engine adds the editor and its vendored libraries to the import map" do
    imports = JSON.parse(Rails.application.importmap.to_json(resolver: ActionController::Base.helpers))["imports"]

    assert imports.key?("tess_edit")
    assert imports.key?("tess_edit/controllers/editor_controller")
    assert imports.key?("tess_edit/vendor/tiptap")
    assert imports.key?("tess_edit/vendor/mjml-browser")
  end

  test "the vendored bundles are served" do
    get ActionController::Base.helpers.asset_path("tess_edit/tiptap.js")
    assert_response :success
    get ActionController::Base.helpers.asset_path("tess_edit/mjml-browser.js")
    assert_response :success
  end

  test "the demo page mounts the editor" do
    get "/"
    assert_response :success
    assert_select "[data-controller='tess-edit'] input[data-tess-edit-target='htmlInput']"
  end
end
