require "test_helper"

# A document's content in its layout's output, as the Content block marks it
class ContentTest < ActiveSupport::TestCase
  SNAPSHOTS = File.expand_path("javascript/snapshots", __dir__)

  test "an HTML layout takes the document's HTML between the markers" do
    layout = "<html><body><header>Logo</header>\n<!-- tess-edit:content -->\n<p>Example</p>\n<!-- /tess-edit:content -->\n</body></html>"
    merged = TessEdit::Content.merge(layout, "\n<p>Own</p>\n")
    assert_equal "\n<p>Own</p>\n", TessEdit::Content.content_of(merged)
    assert_equal "<html><body><header>Logo</header>\n<!-- tess-edit:content -->\n<p>Own</p>\n<!-- /tess-edit:content -->\n</body></html>", merged
  end

  test "an email layout's MJML keeps the markers in mj-raw, and compiles" do
    layout = File.read(File.join(SNAPSHOTS, "content.mjml"))
    merged = TessEdit::Content.merge(layout, "<mj-text>Own</mj-text>")
    assert_includes merged, "<mj-raw><!-- tess-edit:content --></mj-raw><mj-text>Own</mj-text><mj-raw><!-- /tess-edit:content --></mj-raw>"
    assert_includes TessEdit.compile(merged).html, "Own"
  end

  test "an output needs exactly one Content block" do
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.content_of("<p>none</p>") }
    twice = "<!-- tess-edit:content -->a<!-- /tess-edit:content --><!-- tess-edit:content -->b<!-- /tess-edit:content -->"
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.merge(twice, "c") }
  end

  test "a document's own nodes go in and come out of the layout's document" do
    layout = {"type" => "root", "children" => [{"type" => "section", "children" => [{"type" => "content", "children" => [{"type" => "text"}]}]}]}
    own = [{"id" => "b1", "type" => "text", "data" => {"x" => 1}}]
    document = TessEdit::Content.document_with(layout, own)
    assert_equal own, TessEdit::Content.nodes(document)
    assert_equal [{"type" => "text"}], TessEdit::Content.nodes(layout), "the layout stays as it is"
    assert_nil TessEdit::Content.nodes({"type" => "root", "children" => []})
    assert_raises(TessEdit::Content::Error) { TessEdit::Content.document_with({"type" => "root"}, own) }
  end
end
