/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { Node } from 'jsonc-parser';
import { ExtensionContext, Uri, workspace, window, Range, TextDocument, Webview, Position } from 'vscode';
import { utils } from 'pddl-workspace';
import { PddlExtensionContext } from 'pddl-workspace';
import { PddlRange, PddlPosition, parser } from 'pddl-workspace';
import { URI } from 'vscode-uri';

export function createPddlExtensionContext(context: ExtensionContext): PddlExtensionContext {
    return {
        asAbsolutePath: context.asAbsolutePath,
        extensionPath: context.extensionPath,
        storagePath: context.storagePath,
        subscriptions: context.subscriptions,
        pythonPath: function (): string { return workspace.getConfiguration().get("python.pythonPath", "python"); }
    };
}

export async function getWebViewHtml(extensionContext: PddlExtensionContext, options: WebViewHtmlOptions, webview?: Webview): Promise<string> {
    const overviewHtmlPath = extensionContext.asAbsolutePath(path.join(options.relativePath, options.htmlFileName));
    let html = await utils.afs.readFile(overviewHtmlPath, { encoding: "utf-8", flag: 'r' });

    // generate nonce for secure calling of javascript
    const nonce = !options.allowUnsafeInlineScripts ? generateNonce() : undefined;

    html = html.replace(/<(script|img|link) ([^>]*)(src|href)="([^"]+)"/g, (sourceElement: string, elementName: string, middleBits: string, attribName: string, attribValue: string) => {
        if (isAbsoluteWebview(attribValue)) {
            return sourceElement;
        }
        const resource = getWebviewUri(extensionContext, options.relativePath, attribValue, webview);
        const nonceAttr = attribName.toLowerCase() === "src" && nonce ? `nonce="${nonce}"` : "";
        return `<${elementName} ${middleBits ?? ""}${nonceAttr}${attribName}="${resource}"`;
    });

    if (webview) {
        html = html.replace("<!--CSP-->", createContentSecurityPolicy(extensionContext, webview, options, nonce));
    }

    return html;
}

export interface WebViewHtmlOptions {
    /** Relative path in the extension instal directory, where the `htmlFileName` is placed. */
    relativePath: string;
    /** Html file name inside the `relativePath` directory. */
    htmlFileName: string;
    /** Locations of any external scripts, e.g. https://www.gstatic.com/charts/ */
    externalScripts?: Uri[];
    /** Locations of any external styles, e.g. https://www.gstatic.com/charts/ */
    externalStyles?: Uri[];
    /** Locations of any external images, e.g. https://somewhere, or data: */
    externalImages?: Uri[];
    /** Locations of any fonts, e.g. file://../.ttf: */
    fonts?: Uri[];
    /** Disallow inline styles. */
    disableUnsafeInlineStyle?: boolean;
    /** Allow inline scripts. */
    allowUnsafeInlineScripts?: boolean;
}

function isAbsoluteWebview(attribValue: string): boolean {
    return attribValue.match(/^(http[s]?|data):/i) !== null;
}

function getWebviewUri(extensionContext: PddlExtensionContext, relativePath: string, fileName: string, webview?: Webview): Uri {
    return asWebviewUri(Uri.file(extensionContext.asAbsolutePath(path.join(relativePath, fileName))), webview);
}

function getAbsoluteWebviewUri(extensionContext: PddlExtensionContext, webview: Webview, options: WebViewHtmlOptions, uri: Uri): Uri {
    if (uri.scheme === "file") {
        return getWebviewUri(extensionContext, options.relativePath, uri.fsPath.replace(/^\/..\//, '../'), webview);
    } else {
        return uri;
    }
}

function getAbsoluteWebviewUrisSSV(extensionContext: PddlExtensionContext, webview: Webview, options: WebViewHtmlOptions, uris?: Uri[]): string {
    return uris?.map(uri => getAbsoluteWebviewUri(extensionContext, webview, options, uri).toString()).join(" ") ?? "";
}

export function asWebviewUri(localUri: Uri, webview?: Webview): Uri {
    return webview?.asWebviewUri(localUri) ?? localUri.with({ scheme: "vscode-resource" });
}

function createContentSecurityPolicy(extensionContext: PddlExtensionContext, webview: Webview, options: WebViewHtmlOptions, nonce: string): string {
    const externalStyles = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalStyles);
    const externalScripts = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalScripts);
    const externalImages = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalImages);
    const fonts = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.fonts);
    const unsafeInline = "'unsafe-inline'";
    const scriptUnsafeInline = options.allowUnsafeInlineScripts ? unsafeInline : '';
    const styleUnsafeInline = options.disableUnsafeInlineStyle ? '' : unsafeInline;
    const nonceCsp = nonce ? `'nonce-${nonce}'` : '';

    return `<meta http-equiv="Content-Security-Policy"
\t\tcontent="default-src 'none'; `+
        `img-src ${webview.cspSource} ${externalImages} https:; ` +
        `font-src ${fonts};` +
        `script-src ${webview.cspSource} ${externalScripts} ${scriptUnsafeInline} ${nonceCsp}; ` +
        `style-src ${webview.cspSource} ${externalStyles} ${styleUnsafeInline};"
\t/>`;
}

function generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export interface WebviewUriConverter {
    asWebviewUri(localResource: Uri): Uri;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export function firstIndex<T>(array: T[], fn: (t: T) => boolean): number {
    for (let i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }

    return -1;
}

export function compareMaps(map1: Map<string, string>, map2: Map<string, string>): boolean {
    let testVal;
    if (map1.size !== map2.size) {
        return false;
    }
    for (const [key, val] of map1) {
        testVal = map2.get(key);
        // in cases of an undefined value, make sure the key
        // actually exists on the object so there are no false positives
        if (testVal !== val || (testVal === undefined && !map2.has(key))) {
            return false;
        }
    }
    return true;
}

/**
 * Relative fuzzy time in a human readable form.
 * @param time date time
 */
export function toFuzzyRelativeTime(time: number): string {
    const delta = Math.round((+new Date - time) / 1000);

    const minute = 60,
        hour = minute * 60,
        day = hour * 24;

    let fuzzy;

    if (delta < 30) {
        fuzzy = 'just now';
    } else if (delta < minute) {
        fuzzy = delta + ' seconds ago';
    } else if (delta < 2 * minute) {
        fuzzy = 'a minute ago';
    } else if (delta < hour) {
        fuzzy = Math.floor(delta / minute) + ' minutes ago';
    } else if (Math.floor(delta / hour) === 1) {
        fuzzy = '1 hour ago';
    } else if (delta < day) {
        fuzzy = Math.floor(delta / hour) + ' hours ago';
    } else if (delta < day * 2) {
        fuzzy = 'yesterday';
    }
    else {
        fuzzy = Math.floor(delta / day) + ' days ago';
    }

    return fuzzy;
}

export function showError(reason: Error): void {
    console.error(reason);
    window.showErrorMessage(reason.message);
}

export function throwForUndefined<T>(part: string): T {
    throw new Error(`No ${part} defined.`);
}

export function assertDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined || value === null) {
        throw new Error("Assertion error: " + message);
    }
    else {
        return value;
    }
}

/**
 * Absolute path, unless it relied on a %path% location (i.e. there was no dirname). 
 * 
 * This is here merely for background compatibility with previous val configuration storage
 * @param configuredPath a configured path to an executable
 */
export function ensureAbsoluteGlobalStoragePath(configuredPath: string | undefined, context: ExtensionContext): string | undefined {
    if (!configuredPath) { return undefined; }

    if (isHttp(configuredPath)) {
        return configuredPath;
    }

    // if the path is absolute, or contains just the name of an executable (obviously relying on the %path&), return it as is
    if (path.isAbsolute(configuredPath) || !path.dirname(configuredPath)) {
        return configuredPath;
    }
    else {
        // this is here merely for background compatibility with previous val configuration storage
        if (configuredPath.startsWith(path.join('val', 'Val-'))) {
            return path.join(context.globalStoragePath, configuredPath);
        }
        else {
            return configuredPath;
        }
    }
}

export function isHttp(path: string): boolean {
    return path.match(/^http[s]?:/i) !== null;
}

export function toURI(uri: Uri): URI {
    return URI.parse(uri.toString());
}

export function toUri(uri: URI): Uri {
    return Uri.parse(uri.toString());
}

export function equalsCaseInsensitive(text1: string, text2: string): boolean {
    return text1.toLowerCase() === text2.toLowerCase();
}

export function toRange(pddlRange: PddlRange): Range {
    return new Range(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
}

export function nodeToRange(document: TextDocument, node: parser.PddlSyntaxNode): Range {
    return new Range(document.positionAt(node.getStart()), document.positionAt(node.getEnd()));
}

export function toPosition(position: PddlPosition): Position {
    return new Position(position.line, position.character);
}

export function jsonNodeToRange(document: TextDocument, node: Node): Range {
    return new Range(
        document.positionAt(node.offset),
        document.positionAt(node.offset + node.length));
}

export class UriMap<T> extends utils.StringifyingMap<Uri, T> {
    protected stringifyKey(key: Uri): string {
        return key.toString();
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asSerializable(obj: any): any {
    if (obj instanceof Map) {
        return strMapToObj(obj);
    }
    else if (obj instanceof Array) {
        return obj.map(o => asSerializable(o));
    }
    else if (obj instanceof Object) {
        const serObj = Object.create(null);
        Object.keys(obj).forEach(key => serObj[key] = asSerializable(obj[key]));
        return serObj;
    }
    else {
        return obj;
    }
}

export function strMapToObj(strMap: Map<string, unknown>): unknown {
    const obj = Object.create(null);
    for (const [k, v] of strMap) {
        obj[k] = asSerializable(v);
    }
    return obj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function objToStrMap(obj: any): Map<string, any> {
    const strMap = new Map();
    for (const k of Object.keys(obj)) {
        strMap.set(k, obj[k]);
    }
    return strMap;
}

export async function fileExists(manifestUri: Uri): Promise<boolean> {
    try {
        await workspace.fs.stat(manifestUri);
        return true;
    } catch (err) {
        return false;
    }
}
