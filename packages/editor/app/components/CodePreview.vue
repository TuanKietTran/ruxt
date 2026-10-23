<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import postcss from "postcss";
import prefixSelector from "postcss-prefix-selector";
import "github-markdown-css/github-markdown.css";
import { renderCvMarkdownToHtml } from "../utils/cvMarkdown";
import { paginateCvDocument } from "../utils/cvPagination";

const props = withDefaults(defineProps<{
    doc: string;
    css?: string;
}>(), {
    css: "",
});

const html = computed(() => renderCvMarkdownToHtml(props.doc));
const scopedCss = computed(() => {
    try {
        return postcss([
            {
                postcssPlugin: "cv-remove-global-at-rules",
                AtRule(rule) {
                    // These rules cannot be limited to the preview subtree. In particular,
                    // @import would load an entirely unprefixed global stylesheet.
                    if ([
                        "import", "namespace", "page", "property", "font-face",
                        "font-feature-values", "counter-style", "keyframes", "-webkit-keyframes",
                        "layer",
                    ].includes(rule.name.toLowerCase())) {
                        rule.remove();
                    }
                },
            },
            prefixSelector({
                prefix: ".cv-preview-scope",
                transform(prefix, selector, prefixedSelector) {
                    if (/^(?::root|html|body)(?:\b|\s|\.|#|:|\[)/.test(selector)) {
                        return selector.replace(/^(?::root|html|body)/, prefix);
                    }
                    return prefixedSelector;
                },
            }),
        ]).process(props.css, { from: undefined }).css;
    } catch {
        return "";
    }
});
const styleElement = useTemplateRef<HTMLStyleElement>("documentStyle");
const applyDocumentStyle = () => {
    if (styleElement.value) styleElement.value.textContent = scopedCss.value;
};
const pagesElement = useTemplateRef<HTMLElement>("pagesElement");
const previewElement = useTemplateRef<HTMLElement>("previewElement");
const paginating = ref(true);
let frame = 0;
let mounted = false;
let resizeObserver: ResizeObserver | undefined;
const imageSizes = new Map<string, string>();
const paginate = () => {
    frame = 0;
    if (!mounted || !pagesElement.value) return;
    applyDocumentStyle();
    paginateCvDocument(pagesElement.value, html.value);
    paginating.value = false;
};
const schedulePagination = () => {
    if (!mounted) return;
    paginating.value = true;
    if (!frame) frame = requestAnimationFrame(paginate);
};
const imageLoaded = (event: Event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.closest(".cv-pagination-measure")) return;
    const size = `${image.naturalWidth}x${image.naturalHeight}`;
    if (imageSizes.get(image.currentSrc) === size) return;
    imageSizes.set(image.currentSrc, size);
    schedulePagination();
};
watch([html, scopedCss], schedulePagination, { flush: "post" });
onMounted(() => {
    mounted = true;
    paginate();
    void document.fonts?.ready.then(schedulePagination);
    document.fonts?.addEventListener("loadingdone", schedulePagination);
    window.addEventListener("resize", schedulePagination);
    previewElement.value?.addEventListener("load", imageLoaded, true);
    resizeObserver = new ResizeObserver(schedulePagination);
    if (previewElement.value) resizeObserver.observe(previewElement.value);
});
onBeforeUnmount(() => {
    mounted = false;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    document.fonts?.removeEventListener("loadingdone", schedulePagination);
    window.removeEventListener("resize", schedulePagination);
    previewElement.value?.removeEventListener("load", imageLoaded, true);
});
</script>

<template>
    <div ref="previewElement" class="code-preview cv-preview-scope" :aria-busy="paginating" :data-pagination-state="paginating ? 'pending' : 'ready'">
        <!-- Set through textContent so quotes remain valid CSS without allowing HTML injection. -->
        <component :is="'style'" ref="documentStyle" />
        <!-- The paginator only receives sanitized HTML, and preserves styled ancestry on every sheet. -->
        <div ref="pagesElement" class="cv-pages" />
    </div>
</template>

<style scoped>
.code-preview {
    position: relative;
    min-width: max-content;
}

.code-preview :deep(.cv-pages) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    min-width: max-content;
}

.code-preview :deep(.cv-pagination-measure) {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
}

.code-preview :deep(.cv-sheet) {
    box-sizing: border-box;
    flex: none;
    width: 210mm;
    height: 297mm;
    background: white;
    color: #171717;
    font-family: Georgia, "Times New Roman", serif;
    overflow-wrap: anywhere;
    box-shadow: 0 4px 18px rgb(0 0 0 / 20%);
}

.code-preview :deep(.cv-sheet img) {
    max-width: 100%;
}

@media print {
    .code-preview,
    .code-preview :deep(.cv-pages) {
        display: block;
        min-width: 0;
        print-color-adjust: exact;
    }

    .code-preview :deep(.cv-sheet) {
        box-shadow: none;
        break-inside: avoid;
    }

    .code-preview :deep(.cv-sheet + .cv-sheet) {
        break-before: page;
        page-break-before: always;
    }
}
</style>
