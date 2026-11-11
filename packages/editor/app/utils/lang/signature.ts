// Signature help for the CV markdown grammar parsed by cvMarkdown.ts:
// container directives (`:::name{...}`) and trailing attribute blocks
// (`{ .class #id }`) on headings and paragraphs. Pure: no DOM, no I/O.

export interface SignatureParameterInfo {
    label: string;
    documentation: string;
}

export interface SignatureInfo {
    label: string;
    documentation: string;
    parameters: SignatureParameterInfo[];
}

export type SignatureHelpContext = "directive" | "attributes";

export interface SignatureHelp {
    signatures: SignatureInfo[];
    activeSignature: 0;
    /** Index into the active signature's parameters, or -1 on a directive name. */
    activeParameter: number;
    context: SignatureHelpContext;
    /** Directive name for context "directive" (e.g. "resume"). */
    name?: string;
    /** Absolute range of the whole context: the directive sigil or the `{...}` block. */
    from: number;
    to: number;
    /** Absolute range of the attribute token under the cursor, or null between tokens. */
    parameterRange: { from: number; to: number } | null;
    /** Text of the token under the cursor ("" between tokens). */
    parameterText: string;
}

interface Token {
    text: string;
    /** Line-relative offsets, end exclusive. */
    from: number;
    to: number;
}

const CLASS_PARAMETER: SignatureParameterInfo = {
    label: ".class",
    documentation: "A class name. Repeatable: use several .class tokens to add multiple classes.",
};

const ID_PARAMETER: SignatureParameterInfo = {
    label: "#id",
    documentation: "The element id. At most one #id token is kept; a later one replaces an earlier one.",
};

const KEY_VALUE_PARAMETER: SignatureParameterInfo = {
    label: "key=value",
    documentation: "An arbitrary attribute passed through to the rendered element. The value may be quoted (key=\"a b\"); a bare key is shorthand for an empty value.",
};

const directiveSignature = (name: string): SignatureInfo => ({
    label: `:::${name}{ .class … #id key=value … }`,
    documentation: `Container directive: renders as a div whose class list starts with "${name}" plus any .class attributes, with the other attributes set on that div. "resume" is the known CV wrapper directive.`,
    parameters: [CLASS_PARAMETER, ID_PARAMETER, KEY_VALUE_PARAMETER],
});

const ATTRIBUTE_SIGNATURE: SignatureInfo = {
    label: "{ .class … #id }",
    documentation: "Trailing attribute block on a heading or paragraph: sets classes and an id on the rendered element. Only .class and #id tokens are recognised here.",
    parameters: [CLASS_PARAMETER, ID_PARAMETER],
};

/** Split brace content into whitespace-separated tokens, keeping quoted spans together. */
const tokenize = (content: string, contentFrom: number): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < content.length) {
        if (/\s/.test(content[i]!)) { i++; continue; }
        const from = i;
        while (i < content.length && !/\s/.test(content[i]!)) {
            const ch = content[i]!;
            if (ch === '"' || ch === "'") {
                i++;
                while (i < content.length && content[i] !== ch) i++;
                if (i < content.length) i++;
            } else i++;
        }
        tokens.push({ text: content.slice(from, i), from: contentFrom + from, to: contentFrom + i });
    }
    return tokens;
};

const tokenAt = (tokens: Token[], col: number): Token | null =>
    tokens.find((token) => token.from < col && col <= token.to) ?? null;

/** Parameter to highlight when the cursor sits between tokens. */
const nextParameter = (tokens: Token[], context: SignatureHelpContext): number => {
    if (!tokens.length) return 0;
    const hasId = tokens.some((token) => token.text.startsWith("#"));
    if (!hasId) return 1;
    if (context === "directive" && !tokens.some((token) => !token.text.startsWith(".") && !token.text.startsWith("#"))) return 2;
    return 0;
};

const classify = (token: Token, context: SignatureHelpContext): number => {
    if (token.text.startsWith(".")) return 0;
    if (token.text.startsWith("#")) return 1;
    return context === "directive" ? 2 : -1;
};

export function getSignatureHelp(text: string, cursor: number): SignatureHelp | null {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) return null;
    const lineFrom = cursor === 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;
    const lineEndIdx = text.indexOf("\n", cursor);
    const lineTo = lineEndIdx < 0 ? text.length : lineEndIdx;
    const line = text.slice(lineFrom, lineTo);
    const col = cursor - lineFrom;

    const build = (
        context: SignatureHelpContext,
        signature: SignatureInfo,
        open: number,
        close: number,
        name?: string,
    ): SignatureHelp | null => {
        const contentFrom = open + 1;
        const contentTo = close < 0 ? line.length : close;
        const tokens = tokenize(line.slice(contentFrom, contentTo), contentFrom);
        if (context === "attributes" && tokens.some((token) => classify(token, context) < 0)) return null;
        const current = tokenAt(tokens, col);
        return {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: current ? classify(current, context) : nextParameter(tokens, context),
            context,
            ...(name !== undefined ? { name } : {}),
            from: lineFrom + (context === "directive" ? line.search(/\S/) : open),
            to: lineFrom + (close < 0 ? line.length : close + 1),
            parameterRange: current ? { from: lineFrom + current.from, to: lineFrom + current.to } : null,
            parameterText: current?.text ?? "",
        };
    };

    // Directive line: `:::name` optionally followed by `{...}`.
    const directive = line.match(/^(\s*):::([\w-]*)/);
    if (directive) {
        const indent = directive[1]!.length;
        const name = directive[2]!;
        if (!name) return null; // bare `:::` closing fence
        const nameFrom = indent + 3;
        const nameTo = nameFrom + name.length;
        if (col < nameFrom) return null;
        const open = line.indexOf("{", nameTo);
        if (open >= 0 && col > open) {
            const close = line.indexOf("}", open);
            if (close >= 0 && col > close) return null;
            return build("directive", directiveSignature(name), open, close, name);
        }
        // On the name, or between the name and its brace: show the signature
        // with no active parameter yet.
        return {
            signatures: [directiveSignature(name)],
            activeSignature: 0,
            activeParameter: -1,
            context: "directive",
            name,
            from: lineFrom + indent,
            to: lineFrom + (open >= 0 ? open : line.length),
            parameterRange: null,
            parameterText: "",
        };
    }

    // Trailing attribute block anywhere on the line: `{ .class #id }`.
    for (let open = line.indexOf("{"); open >= 0; open = line.indexOf("{", open + 1)) {
        const close = line.indexOf("}", open);
        const inside = col > open && (close < 0 || col <= close);
        if (!inside) continue;
        const content = line.slice(open + 1, close < 0 ? line.length : close);
        if (content.trim() && !/^(?:[.#][\w-]+\s*)+$/.test(content.trim())) continue;
        return build("attributes", ATTRIBUTE_SIGNATURE, open, close);
    }
    return null;
}
