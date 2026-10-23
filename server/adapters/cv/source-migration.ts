export interface CvIndicatorSources {
   markdown: string;
   css: string;
}

const LEGACY_PAGE_SELECTOR = /\.(?:cv-sheet|cv-document)\b/;
const INDICATOR_OPEN = /^:::resume\s*$/m;

function addNameIndicator(markdown: string): string {
   return markdown.replace(/^(#\s+[^\n{]+?)\s*$/m, "$1 {.cv-name}");
}

function wrapPagesWithIndicator(markdown: string): string {
   if (INDICATOR_OPEN.test(markdown)) return addNameIndicator(markdown);
   if (/^:::cv-document\s*$/m.test(markdown)) {
      return addNameIndicator(markdown.replace(/^:::cv-document\s*$/gm, ":::resume"));
   }

   return addNameIndicator(markdown
      .split(/^\s*---\s*$/m)
      .map(page => `:::resume\n\n${page.trim()}\n\n:::`)
      .join("\n\n---\n\n"));
}

function migrateStylesheet(css: string): string {
   return css
      .replace(/\.(?:cv-sheet|cv-document)\b/g, ".resume")
      .replace(/\.resume\s+h1\s*\+/g, ".cv-name +")
      .replace(/\.resume\s+h1\b/g, ".cv-name")
      .replace(/^\s*@page\s*\{[^{}]*\}\s*$/gmi, "")
      .replace(/^\s*(?:html\s*,\s*body|body\s*,\s*html)\s*\{[^{}]*\}\s*$/gmi, "")
      // Physical page separation belongs to CodePreview's application-owned sheets.
      .replace(/^\s*\.resume\s*\+\s*\.resume\s*\{[^{}]*\}\s*$/gmi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n";
}

/**
 * Soft-migrate former `.cv-sheet`/`.cv-document` source contracts to the
 * explicit `:::resume` Markdown indicator.
 * Unrelated/custom Markdown and CSS are returned byte-for-byte unchanged.
 */
export function migrateCvIndicatorSources(source: CvIndicatorSources): CvIndicatorSources & { changed: boolean } {
   if (!LEGACY_PAGE_SELECTOR.test(source.css)) return { ...source, changed: false };

   return {
      markdown: wrapPagesWithIndicator(source.markdown),
      css: migrateStylesheet(source.css),
      changed: true,
   };
}
