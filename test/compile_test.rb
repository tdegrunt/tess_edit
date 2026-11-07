require "test_helper"

# The MJML snapshots of every block, in both modes, and of the sample compile
# with MRML, as the editor compiles them through the endpoint.
class CompileTest < ActiveSupport::TestCase
  SNAPSHOTS = File.expand_path("javascript/snapshots", __dir__)

  Dir[File.join(SNAPSHOTS, "**/*.mjml")].sort.each do |file|
    test "#{file.delete_prefix("#{SNAPSHOTS}/")} compiles" do
      result = TessEdit.compile(File.read(file))
      assert_empty result.errors
      assert_match(/<body/, result.html)
    end
  end

  test "Liquid in the sample survives compiling" do
    html = TessEdit.compile(File.read(File.join(SNAPSHOTS, "sample.mjml"))).html
    ["{% for line in order.lines %}", "{% endfor %}", "{% if customer.orders_count == 1 %}", "{% endif %}", "{{ line.total | money }}", "href=\"{{ order.url }}\""].each do |tag|
      assert_includes html, tag
    end
  end

  test "MJML that can't be parsed gives errors and no HTML" do
    result = TessEdit.compile("<mjml><mj-body><mj-text>open</mj-body></mjml>")
    assert_nil result.html
    assert_equal 1, result.errors.size
  end

  test "MJML with CRLF line endings, as browsers submit form fields, compiles" do
    sample = File.read(File.join(SNAPSHOTS, "sample.mjml"))
    result = TessEdit.compile(sample.gsub("\n", "\r\n"))
    assert_empty result.errors
    assert_equal TessEdit.compile(sample).html, result.html
  end
end
