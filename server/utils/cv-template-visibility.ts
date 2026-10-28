import type { CvTemplateProps } from "@ruxt/shared/cv";

type TemplateVisibility = Pick<CvTemplateProps, "id" | "version" | "tags">;

/** Ownerless private templates must never be returned or used on behalf of another account. */
export const isPublicCvTemplate = (template: TemplateVisibility) =>
    template.tags.includes("public") && !template.tags.includes("internal");

/** Only the fixed server-owned pipeline seed is allowed as a non-public import source. */
export const isImportCvTemplate = (template: TemplateVisibility) => isPublicCvTemplate(template)
    || (template.id === "pipeline-default" && template.version === 1 && template.tags.includes("internal"));
