import { registerListCvDocuments } from "@core/handlers/list-cv-documents";
import { registerCreateCvDocument } from "@core/handlers/create-cv-document";
import { registerGetCvDocument } from "@core/handlers/get-cv-document";
import { registerSaveCvSource } from "@core/handlers/save-cv-source";
import { registerPatchCvSource } from "@core/handlers/patch-cv-source";
import { registerCreateCvImport } from "@core/handlers/create-cv-import";
import { registerGetCvImport } from "@core/handlers/get-cv-import";
import { registerPreviewCvImport } from "@core/handlers/preview-cv-import";
import { registerCancelCvImport } from "@core/handlers/cancel-cv-import";
import { registerRetryCvImport } from "@core/handlers/retry-cv-import";
import { registerCommitCvImport } from "@core/handlers/commit-cv-import";
import { registerGetCvCapabilities } from "@core/handlers/get-cv-capabilities";
import { registerGetCvApplication } from "@core/handlers/get-cv-application";
import { registerListCvTemplates } from "@core/handlers/list-cv-templates";
import { registerGetCvTemplate } from "@core/handlers/get-cv-template";
import { registerCloneCvTemplate } from "@core/handlers/clone-cv-template";
import { registerSaveCvTemplate } from "@core/handlers/save-cv-template";
import { registerComposeCvProfile } from "@core/handlers/compose-cv-profile";
import { registerUpdateCvApplicationProfile } from "@core/handlers/update-cv-application-profile";
import { registerSwitchCvProfile } from "@core/handlers/switch-cv-profile";
import { registerDetectCvProfile } from "@core/handlers/detect-cv-profile";
import { registerApplyCvProfile } from "@core/handlers/apply-cv-profile";
import type { CvDocumentPort } from "@core/repos/cv-document.repo";
import type { CvApplicationRepository } from "@core/repos/cv-application.repo";
import type { CvArtifactRepository, CvImportRepository } from "@core/repos/cv-import.repo";
import type { CvTemplateRepository } from "@core/repos/cv-template.repo";
import type { CvExtractor } from "@core/handlers/extract-cv";

export interface CvDependencies {
   documents: CvDocumentPort;
   applications: CvApplicationRepository;
   artifacts: CvArtifactRepository;
   imports: CvImportRepository;
   extractor: CvExtractor;
   templates: CvTemplateRepository;
}

export function registerCvHandlers(deps: CvDependencies): void {
   registerListCvDocuments(deps.documents);
   registerCreateCvDocument(deps.documents);
   registerGetCvDocument(deps.documents);
   registerSaveCvSource(deps.documents);
   registerPatchCvSource(deps.documents);
   registerCreateCvImport(deps.imports);
   registerGetCvImport(deps.imports);
   registerPreviewCvImport(deps.imports, deps.artifacts);
   registerCancelCvImport(deps.imports);
   registerRetryCvImport(deps.imports);
   registerCommitCvImport(deps);
   registerGetCvCapabilities(deps.extractor);
   registerGetCvApplication(deps.applications);
   registerListCvTemplates(deps.templates);
   registerGetCvTemplate(deps.templates);
   registerCloneCvTemplate(deps.templates);
   registerSaveCvTemplate(deps.templates);
   registerComposeCvProfile(deps);
   registerUpdateCvApplicationProfile(deps);
   registerSwitchCvProfile();
   registerDetectCvProfile(deps.documents);
   registerApplyCvProfile();
}
