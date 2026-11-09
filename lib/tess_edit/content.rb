module TessEdit
  # A document's own content in its layout. The layout's Content block marks
  # its place in the MJML or HTML with two comments (in <mj-raw> tags in MJML):
  #
  #   <!-- tess-edit:content --> … the blocks inside the Content block … <!-- /tess-edit:content -->
  #
  # A document stores its own blocks; the host puts them in the layout's
  # document for the editor (document_with), and takes them out again when it
  # saves (nodes). The layout's output with the document's output between the
  # markers (merge) is the whole document, also after the layout changed.
  module Content
    START = "<!-- tess-edit:content -->"
    FINISH = "<!-- /tess-edit:content -->"
    MJML_START = "<mj-raw>#{START}</mj-raw>"
    MJML_FINISH = "<mj-raw>#{FINISH}</mj-raw>"
    MARKED = /(#{Regexp.escape(MJML_START)}|#{Regexp.escape(START)})(.*?)(#{Regexp.escape(MJML_FINISH)}|#{Regexp.escape(FINISH)})/m

    class Error < StandardError; end

    module_function

    # What is between the markers
    def content_of(output)
      matches = output.to_s.scan(MARKED)
      raise Error, "The output has #{matches.size} Content blocks, it needs exactly one" unless matches.size == 1

      matches.first[1]
    end

    # The layout's output with this content between its markers
    def merge(layout_output, content)
      content_of(layout_output)
      layout_output.sub(MARKED) { "#{$1}#{content}#{$3}" }
    end

    # The children of the document's Content block, nil when it has none
    def nodes(document)
      content_node(document)&.fetch("children", [])
    end

    # The layout's document with these nodes in its Content block
    def document_with(layout_document, nodes)
      document = layout_document.deep_dup
      content = content_node(document)
      raise Error, "The layout has no Content block" unless content

      content["children"] = nodes || []
      document
    end

    def content_node(node)
      return nil unless node.is_a?(Hash)
      return node if node["type"] == "content"

      Array(node["children"]).each do |child|
        found = content_node(child)
        return found if found
      end
      nil
    end
  end
end
