/** Layout measurements are converted back to CSS pixels: preview zoom must not affect breaks. */
export function fitsCvPage(bottom: number, pageTop: number, scale: number, bottomInset: number, height: number): boolean {
    return scale > 0 && (bottom - pageTop) / scale + bottomInset <= height + 0.5;
}

/** Largest prefix accepted by a monotone layout predicate (also used for oversized paragraphs). */
export function fittingPrefix(length: number, fits: (length: number) => boolean): number {
    let low = 0;
    let high = length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(middle)) low = middle;
        else high = middle - 1;
    }
    return low;
}

/** Physical sheets of a preview. Sheets in the hidden measuring stage are work in progress, not pages. */
export function countCvSheets(root: ParentNode | null | undefined): number {
    if (!root) return 0;
    return [...root.querySelectorAll(".cv-sheet")].filter(sheet => !sheet.closest(".cv-pagination-measure")).length;
}

const containers = new Set(["DIV", "SECTION", "ARTICLE", "MAIN", "UL", "OL", "TABLE", "THEAD", "TBODY", "TFOOT", "BLOCKQUOTE"]);
const meaningful = (node: Node) => node.nodeType === 1 || Boolean(node.textContent?.trim());
const heading = (node: Node) => node.nodeType === 1 && /^H[1-6]$/.test((node as Element).tagName);
const number = (value: string) => Number.parseFloat(value) || 0;

/**
 * Paginate sanitized HTML in the real preview's style/zoom context, not an estimated character count.
 * Each continuation clones its ancestors, including directive classes such as `.resume`.
 * Work happens in a hidden sibling; readers/exporters only see a complete set of physical sheets.
 */
export function paginateCvDocument(output: HTMLElement, html: string): number {
    const document = output.ownerDocument;
    const window = document.defaultView!;
    const template = document.createElement("template");
    template.innerHTML = html;
    const stage = document.createElement("div");
    stage.className = "cv-pages cv-pagination-measure";
    stage.setAttribute("aria-hidden", "true");
    output.after(stage);

    let sheet: HTMLElement;
    let shells = new Map<Node, HTMLElement>();
    let placements: { source: Node; path: Element[]; node: Node }[] = [];
    let pendingBreak = false;

    const newPage = () => {
        sheet = document.createElement("article");
        sheet.className = "cv-sheet";
        sheet.setAttribute("aria-label", `CV page ${stage.children.length + 1}`);
        stage.append(sheet);
        shells = new Map();
        placements = [];
    };
    newPage();

    const parentFor = (path: Element[], source: Node): HTMLElement => {
        let parent = sheet;
        for (const ancestor of path) {
            let shell = shells.get(ancestor);
            if (!shell) {
                shell = ancestor.cloneNode(false) as HTMLElement;
                // Continue ordered numbering when a list spans physical sheets.
                if (ancestor.tagName === "OL") {
                    let child = source;
                    while (child.parentNode && child.parentNode !== ancestor) child = child.parentNode;
                    const before = [...ancestor.children].indexOf(child as Element);
                    shell.setAttribute("start", String(number(ancestor.getAttribute("start") ?? "1") + Math.max(0, before)));
                }
                parent.append(shell);
                shells.set(ancestor, shell);
            }
            parent = shell;
        }
        return parent;
    };
    const remove = (node: Node) => {
        let parent = node.parentElement;
        node.parentNode?.removeChild(node);
        while (parent && parent !== sheet && ![...parent.childNodes].some(meaningful)) {
            const empty = parent;
            parent = parent.parentElement;
            for (const [source, shell] of shells) if (shell === empty) shells.delete(source);
            empty.remove();
        }
    };
    const bottomInset = (node: Node): number => {
        let inset = number(window.getComputedStyle(sheet).paddingBottom);
        if (node.nodeType === 1) inset += number(window.getComputedStyle(node as Element).marginBottom);
        let parent = node.parentElement;
        while (parent && parent !== sheet) {
            const style = window.getComputedStyle(parent);
            inset += number(style.paddingBottom) + number(style.borderBottomWidth);
            parent = parent.parentElement;
        }
        return inset;
    };
    const pageGeometry = () => {
        const rect = sheet.getBoundingClientRect();
        const style = window.getComputedStyle(sheet);
        return { rect, scale: rect.width / number(style.width), height: number(style.height) };
    };
    const fits = (node: Node): boolean => {
        const { rect, scale, height } = pageGeometry();
        let bottom: number;
        if (node.nodeType === 1) bottom = (node as Element).getBoundingClientRect().bottom;
        else {
            const range = document.createRange();
            range.selectNode(node);
            bottom = range.getBoundingClientRect().bottom;
        }
        return fitsCvPage(bottom, rect.top, scale, bottomInset(node), height);
    };

    // Clone a rich-text prefix/suffix without losing links, emphasis, or nested inline markup.
    const textPart = (source: Node, start: number, end: number): Node => {
        const clone = source.cloneNode(true);
        const walker = document.createTreeWalker(clone, 4 /* SHOW_TEXT */);
        const texts: Text[] = [];
        let text: Node | null;
        while ((text = walker.nextNode())) texts.push(text as Text);
        if (source.nodeType === 3) return document.createTextNode((source.textContent ?? "").slice(start, end));
        const locate = (offset: number): [Node, number] => {
            for (const text of texts) {
                if (offset <= text.length) return [text, offset];
                offset -= text.length;
            }
            return [clone, clone.childNodes.length];
        };
        // Trimming a full clone retains inline ancestors even when both endpoints fall in the
        // same text node. cloneContents alone would drop that node's <strong>/<a> ancestors.
        const range = document.createRange();
        range.selectNodeContents(clone);
        range.setStart(...locate(end));
        range.deleteContents();
        range.selectNodeContents(clone);
        range.setEnd(...locate(start));
        range.deleteContents();
        return clone;
    };

    const append = (source: Node, path: Element[]) => {
        if (!meaningful(source)) return;
        if (source.nodeType === 1 && (source as Element).tagName === "HR") {
            pendingBreak = placements.length > 0;
            return;
        }
        if (pendingBreak) { newPage(); pendingBreak = false; }
        const element = source.nodeType === 1 ? source as HTMLElement : null;
        // A nested thematic break is a page boundary, not an HTML string delimiter.
        const hasBreak = Boolean(element?.querySelector("hr"));
        let clone = source.cloneNode(true);
        parentFor(path, source).appendChild(clone);
        if (!hasBreak && fits(clone)) {
            placements.push({ source, path, node: clone });
            return;
        }
        remove(clone);
        if (element && containers.has(element.tagName) && [...element.childNodes].some(meaningful)) {
            for (const child of [...element.childNodes]) append(child, [...path, element]);
            return;
        }
        if (placements.length) {
            // Do not strand a section heading at the foot of the preceding page.
            const previous = placements.at(-1)!;
            const carry = heading(previous.source) ? previous : null;
            if (carry) { remove(carry.node); placements.pop(); }
            if (placements.length) newPage();
            if (carry) {
                parentFor(carry.path, carry.source).appendChild(carry.node);
                placements.push(carry);
            }
            clone = source.cloneNode(true);
            parentFor(path, source).appendChild(clone);
            if (fits(clone)) {
                placements.push({ source, path, node: clone });
                return;
            }
            remove(clone);
        }

        // One paragraph/list item may exceed an entire sheet. Split its rich text rather than
        // letting it escape the sheet or repeatedly pushing an impossible block to another page.
        const length = source.textContent?.length ?? 0;
        if (length > 1) {
            const parent = parentFor(path, source);
            const count = fittingPrefix(length, (end) => {
                const part = textPart(source, 0, end);
                parent.appendChild(part);
                const result = fits(part);
                part.parentNode?.removeChild(part);
                return result;
            });
            if (count > 0 && count < length) {
                // Prefer a word boundary, but still make progress for very long unbroken tokens.
                const text = source.textContent!;
                const space = text.lastIndexOf(" ", count - 1);
                const end = space > count / 2 ? space + 1 : count;
                const prefix = textPart(source, 0, end);
                parent.appendChild(prefix);
                placements.push({ source, path, node: prefix });
                newPage();
                append(textPart(source, end, length), path);
                return;
            }
        }

        // Non-text atomic content (e.g. a very tall image) still belongs to a physical sheet.
        clone = source.cloneNode(true);
        parentFor(path, source).appendChild(clone);
        if (clone.nodeType === 1 && !fits(clone)) {
            const atomic = clone as HTMLElement;
            const { rect: pageRect, scale, height } = pageGeometry();
            const rect = atomic.getBoundingClientRect();
            const available = Math.max(1, height - (rect.top - pageRect.top) / scale - bottomInset(atomic));
            atomic.style.width = `${rect.width / scale}px`;
            atomic.style.zoom = String(Math.min(1, available / (rect.height / scale)));
        }
        placements.push({ source, path, node: clone });
    };

    try {
        for (const child of [...template.content.childNodes]) append(child, []);
        const pages = [...stage.children];
        output.replaceChildren(...pages);
        output.dispatchEvent(new window.CustomEvent("cv-pagination-complete", { bubbles: true, detail: { pages: pages.length } }));
        return pages.length;
    } finally {
        stage.remove();
    }
}
