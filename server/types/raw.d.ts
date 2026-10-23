/** Nitro's cv-raw-assets loader exports Markdown/CSS ?raw imports as strings. */
declare module "*?raw" {
    const source: string;
    export default source;
}
