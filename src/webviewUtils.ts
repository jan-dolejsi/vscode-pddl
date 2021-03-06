/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, Uri, Webview } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export async function getWebViewHtml(extensionContext: ExtensionContext, options: WebViewHtmlOptions, webview?: Webview): Promise<string> {
    const htmlPath = extensionContext.asAbsolutePath(path.join(options.relativePath, options.htmlFileName));
    const templateHtml = (await fs.promises.readFile(htmlPath, { encoding: "utf-8", flag: 'r' })).toString();

    // generate nonce for secure calling of javascript
    const nonce = !options.allowUnsafeInlineScripts ? generateNonce() : undefined;

    // be sure that the template has a placeholder for Content Security Policy
    const cspPlaceholderPattern = /<!--\s*CSP\s*-->/i;
    if (!templateHtml.match(cspPlaceholderPattern) || templateHtml.includes('http-equiv="Content-Security-Policy"')) {
        throw new Error(`Template does not contain CSP placeholder or contains rogue CSP.`);
    }
    
    let html = templateHtml.replace(/<(script|img|link) ([^>]*)(src|href)="([^"]+)"/g, (sourceElement: string, elementName: string, middleBits: string, attribName: string, attribValue: string) => {
        if (isAbsoluteWebview(attribValue)) {
            return sourceElement;
        }
        const resource = getWebviewUri(extensionContext, options.relativePath, attribValue, webview);
        const nonceAttr = elementName.toLowerCase() === "script" && attribName.toLowerCase() === "src" && nonce ? `nonce="${nonce}" ` : "";
        return `<${elementName} ${middleBits ?? ""}${nonceAttr}${attribName}="${resource}"`;
    });

    if (webview) {
        cspPlaceholderPattern.lastIndex = 0;
        html = html.replace(cspPlaceholderPattern, createContentSecurityPolicy(extensionContext, webview, options, nonce));
    }

    return html;
}

function isAbsoluteWebview(attribValue: string): boolean {
    return attribValue.match(/^(http[s]?|data):/i) !== null;
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
    /** Allow eval() */
    allowUnsafeEval?: boolean;
}

function getWebviewUri(extensionContext: ExtensionContext, relativePath: string, fileName: string, webview?: Webview): Uri {
    return asWebviewUri(Uri.file(extensionContext.asAbsolutePath(path.join(relativePath, fileName))), webview);
}

function getAbsoluteWebviewUri(extensionContext: ExtensionContext, webview: Webview, options: WebViewHtmlOptions, uri: Uri): Uri {
    if (uri.scheme === "file") {
        return getWebviewUri(extensionContext, options.relativePath, uri.fsPath.replace(/^\/..\//, '../'), webview);
    } else {
        return uri;
    }
}

function getAbsoluteWebviewUrisSSV(extensionContext: ExtensionContext, webview: Webview, options: WebViewHtmlOptions, uris?: Uri[]): string {
    return uris?.map(uri => getAbsoluteWebviewUri(extensionContext, webview, options, uri).toString()).join(" ") ?? "";
}

export function asWebviewUri(localUri: Uri, webview?: Webview): Uri {
    return webview?.asWebviewUri(localUri) ?? localUri.with({ scheme: "vscode-resource" });
}

function createContentSecurityPolicy(extensionContext: ExtensionContext, webview: Webview, options: WebViewHtmlOptions, nonce: string | undefined): string {
    const externalStyles = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalStyles);
    const externalScripts = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalScripts);
    const externalImages = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.externalImages);
    const fonts = getAbsoluteWebviewUrisSSV(extensionContext, webview, options, options.fonts);
    const unsafeInline = "'unsafe-inline'";
    const scriptUnsafeInline = options.allowUnsafeInlineScripts ? unsafeInline : '';
    const scriptUnsafeEval = options.allowUnsafeEval ? "'unsafe-eval'" : '';
    const styleUnsafeInline = options.disableUnsafeInlineStyle ? '' : unsafeInline;
    const nonceCsp = nonce ? `'nonce-${nonce}'` : '';

    return `<meta http-equiv="Content-Security-Policy"
\t\tcontent="default-src 'none'; `+
        `img-src ${webview.cspSource} ${externalImages} https:; ` +
        `font-src ${fonts};` +
        `script-src ${webview.cspSource} ${externalScripts} ${scriptUnsafeInline} ${scriptUnsafeEval} ${nonceCsp}; ` +
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
