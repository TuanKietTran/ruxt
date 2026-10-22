import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue"]);
const FORBIDDEN_IMPORTS = ["@core", "@ruxt/core"];

function walkSources(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkSources(path));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
    }
    return files;
}

function scriptBlocks(source) {
    const blocks = [];
    const openingTag = /<script\b[^>]*>/gi;
    let opening;
    while ((opening = openingTag.exec(source))) {
        const closing = /<\/script\s*>/gi;
        closing.lastIndex = openingTag.lastIndex;
        const end = closing.exec(source);
        if (!end) continue;
        blocks.push({ text: source.slice(openingTag.lastIndex, end.index), offset: openingTag.lastIndex });
        openingTag.lastIndex = closing.lastIndex;
    }
    return blocks;
}

function isForbidden(specifier) {
    return FORBIDDEN_IMPORTS.some(prefix => specifier === prefix || specifier.startsWith(`${prefix}/`));
}

function moduleSpecifier(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        return node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier : undefined;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        return node.argument.literal;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
        return node.moduleReference.expression;
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const expression = node.expression;
        if (expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(expression) && expression.text === "require")) {
            return node.arguments[0];
        }
    }
    return undefined;
}

export function findForbiddenAppImports(appRoot) {
    const findings = [];
    for (const file of walkSources(appRoot)) {
        const source = readFileSync(file, "utf8");
        const blocks = extname(file) === ".vue" ? scriptBlocks(source) : [{ text: source, offset: 0 }];
        for (const block of blocks) {
            const scriptKind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
            const sourceFile = ts.createSourceFile(file, block.text, ts.ScriptTarget.Latest, true, scriptKind);
            const visit = node => {
                const specifier = moduleSpecifier(node);
                if (specifier && isForbidden(specifier.text)) {
                    const position = block.offset + specifier.getStart(sourceFile) - sourceFile.getStart(sourceFile);
                    const line = source.slice(0, position).split("\n").length;
                    findings.push({ file: relative(appRoot, file), line, specifier: specifier.text });
                }
                ts.forEachChild(node, visit);
            };
            visit(sourceFile);
        }
    }
    return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.specifier.localeCompare(b.specifier));
}
