module TessEdit
  class Engine < ::Rails::Engine
    isolate_namespace TessEdit

    initializer "tess_edit.assets" do |app|
      if app.config.respond_to?(:assets)
        app.config.assets.paths << root.join("app/javascript")
        app.config.assets.paths << root.join("vendor/javascript")
      end
    end

    # tess_edit_translations in every view, as the host renders the editor
    initializer "tess_edit.helpers" do
      ActiveSupport.on_load(:action_view) { include TessEdit::TranslationsHelper }
    end

    initializer "tess_edit.importmap", before: "importmap" do |app|
      app.config.importmap.paths << root.join("config/importmap.rb")
      app.config.importmap.cache_sweepers << root.join("app/javascript")
      app.config.importmap.cache_sweepers << root.join("vendor/javascript")
    end
  end
end
