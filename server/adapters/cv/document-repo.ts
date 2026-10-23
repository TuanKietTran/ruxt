import type { CvDocumentPort } from "@ruxt/core/repos/cv-document.repo";
import { createCvDocument, deleteCvDocument, getCvDocument, listCvDocuments, updateCvDocument } from "./document-store";

/** Adapts the Nitro fs-backed CV document store to the core CvDocumentPort. */
export const cvDocumentRepo: CvDocumentPort = {
   listCvDocuments,
   getCvDocument,
   createCvDocument,
   removeCvDocument: deleteCvDocument,
   updateCvDocument,
};
