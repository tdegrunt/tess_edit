import "controllers"
import { application } from "controllers/application"
import { registerBlock, registerTessEdit } from "tess_edit"
import content from "blocks/content"

registerBlock(content)
registerTessEdit(application)
