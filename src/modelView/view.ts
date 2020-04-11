/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    WebviewPanel, ViewColumn, CodeLens, TextDocument, Range, Command, Webview
} from 'vscode';


export interface WebviewAdapter {
    isVisible(): boolean;
    canReveal(): boolean;
    dispose(): void;
    reveal(displayColumn: ViewColumn): void;
    html: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(message: any): Thenable<boolean>;
    readonly isInset: boolean;
    readonly webview: Webview;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(message: any): Thenable<boolean> {
        return this.panel.webview.postMessage(message);
    }
    public get isInset(): boolean {
        return false;
    }
    public get webview(): Webview {
        return this.panel.webview;
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
