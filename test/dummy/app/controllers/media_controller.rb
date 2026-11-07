# The demo's images for Image blocks (the editor's mediaUrl, see
# core/media.js), kept in tmp/media. A host app keeps them its own way, e.g.
# with Active Storage.
class MediaController < ApplicationController
  SAMPLE = {id: "sample", url: "https://placehold.co/600x300/fde68a/92400e.png?text=Sample", name: "Sample"}.freeze

  def index
    render json: {images: [SAMPLE] + directory.glob("*").sort.map { |path| image(path.basename.to_s) }}
  end

  def create
    file = params.require(:file)
    return render(json: {errors: ["Only images can be uploaded"]}, status: :unprocessable_entity) unless file.content_type.to_s.start_with?("image/")

    name = "#{SecureRandom.hex(4)}-#{File.basename(file.original_filename).gsub(/[^\w.-]/, "_")}"
    directory.mkpath
    File.binwrite(directory.join(name), file.read)
    render json: image(name)
  end

  def show
    path = directory.join(File.basename(params[:name]))
    return head(:not_found) unless path.file?

    send_file path, disposition: "inline"
  end

  private

  def directory
    Rails.root.join("tmp/media")
  end

  def image(name)
    {id: name, url: media_file_url(name), name: name.sub(/\A\h{8}-/, "")}
  end
end
