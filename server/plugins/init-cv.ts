import { registerCvHandlers } from "@infra/cv-registry";
import { cvDocumentRepo } from "../adapters/cv/document-repo";
import { cvApplicationRepo } from "../adapters/cv/application-repo";
import { cvArtifactRepo, cvImportRepo } from "../adapters/cv/pipeline-repos";
import { cvPipelineExtractor } from "../adapters/cv/pipeline-extractor";
import { cvTemplateRepo, ensurePersistedTemplates } from "../adapters/cv/template-repo";

export default defineNitroPlugin(() => {
   registerCvHandlers({
      documents: cvDocumentRepo,
      applications: cvApplicationRepo,
      artifacts: cvArtifactRepo,
      imports: cvImportRepo,
      extractor: cvPipelineExtractor,
      templates: cvTemplateRepo,
   });
   // Apply template seeds and visibility migrations when a deployment boots, not on its first catalog request.
   ensurePersistedTemplates().catch(error => console.error("[cv] template migration failed", error));
});
