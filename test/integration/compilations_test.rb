require "test_helper"

class CompilationsTest < ActionDispatch::IntegrationTest
  MJML = "<mjml><mj-body><mj-section><mj-column><mj-text>Hi {{ name }}</mj-text></mj-column></mj-section></mj-body></mjml>"

  test "compiles MJML to HTML" do
    post tess_edit.compile_path, params: {mjml: MJML}, as: :json

    assert_response :success
    assert_includes response.parsed_body["html"], "Hi {{ name }}"
    assert_empty response.parsed_body["errors"]
  end

  test "reports MJML that can't be compiled" do
    post tess_edit.compile_path, params: {mjml: "<mjml><mj-body>"}, as: :json

    assert_response :unprocessable_content
    assert_nil response.parsed_body["html"]
    assert_not_empty response.parsed_body["errors"]
  end

  test "requires the CSRF token" do
    ActionController::Base.allow_forgery_protection = true
    post tess_edit.compile_path, params: {mjml: MJML}, as: :json
    assert_response :unprocessable_content
    assert_nil response.parsed_body["html"] if response.media_type == "application/json"
  ensure
    ActionController::Base.allow_forgery_protection = false
  end
end
