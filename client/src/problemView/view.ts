/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    ExtensionContext, WebviewPanel, ViewColumn
} from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';

export interface ProblemRenderer<TOptions, TData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: TOptions): TData;
}

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
