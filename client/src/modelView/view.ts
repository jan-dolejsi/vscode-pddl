/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    WebviewPanel, ViewColumn, CodeLens, TextDocument, Range, Command, WebviewEditorInset
} from 'vscode';


export interface WebviewAdapter {
    isVisible(): boolean;
    canReveal(): boolean;
    dispose(): void;
    reveal(displayColumn: ViewColumn): void;
    html: string;
    postMessage(message: any): Thenable<boolean>;
    readonly isInset: boolean;
}

export class WebviewPanelAdapter implements WebviewAdapter {
    constructor(private panel: WebviewPanel) { }
    canReveal(): boolean {
        return true;
    }
    dispose(): void {
        this.panel.dispose();
    }
    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn);
    }
    isVisible(): boolean {
        return this.panel.visible;
    }
    public get html(): string {
        return this.panel.webview.html;
    }
    public set html(value: string) {
        this.panel.webview.html = value;
    }
    postMessage(message: any): Thenable<boolean> {
        return this.panel.webview.postMessage(message);
    }
    public get isInset(): boolean {
        return false;
    }
}

export class WebviewInsetAdapter implements WebviewAdapter {
    constructor(public readonly inset: WebviewEditorInset) { }
    isVisible(): boolean {
        return true; // or maybe: this.editor.visibleRanges.length > 0;
    }
    canReveal(): boolean {
        return false;
    }
    dispose(): void {
        this.inset.dispose();
    }
    reveal(_displayColumn: ViewColumn): void {
        throw new Error("Check canReveal() first.");
    }
    public get html(): string {
        return this.inset.webview.html;
    }
    public set html(value: string) {
        this.inset.webview.html = value;
    }
    postMessage(message: any): Thenable<boolean> {
        return this.inset.webview.postMessage(message);
    }
    public get isInset(): boolean {
        return true;
    }
}
export class DocumentCodeLens extends CodeLens {
    constructor(private document: TextDocument, range: Range, command?: Command) {
        super(range, command);
    }

    getDocument(): TextDocument {
        return this.document;
    }
}

export class DocumentInsetCodeLens extends DocumentCodeLens {
    constructor(document: TextDocument, range: Range, private line: number, command?: Command) {
        super(document, range, command);
    }

    getLine(): number {
        return this.line;
    }
}
