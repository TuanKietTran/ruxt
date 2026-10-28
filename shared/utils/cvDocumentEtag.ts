/**
 * Strong HTTP validator for one CV document representation, computed identically by the server
 * (ETag) and the editor (If-None-Match). It changes on every save (revision, updatedAt), on rename
 * (title) and when a deleted session is recreated (updatedAt).
 */
export function cvDocumentEtag(document: { revision: number; updatedAt: string; title?: string }): string {
    let hash = 0x811c9dc5;
    for (const character of `${document.updatedAt}\n${document.title ?? ""}`) {
        hash = Math.imul(hash ^ character.codePointAt(0)!, 0x01000193) >>> 0;
    }
    return `"${document.revision}-${hash.toString(36)}"`;
}
