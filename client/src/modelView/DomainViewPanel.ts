/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, ViewColumn } from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';
import { WebviewAdapter } from './view';
import { BaseViewPanel } from './BaseViewPanel';

export class DomainViewPanel extends BaseViewPanel {

    private needsRebuild = false;
    private domain: DomainInfo | undefined;
    private error: Error | undefined;

    constructor(uri: Uri, panel: WebviewAdapter) {
        super(uri, panel);
    }

    setDomain(domain: DomainInfo): void {
        this.domain = domain;
        this.error = undefined;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;
    }

    getError(): Error | undefined {
        return this.error;
    }

    getDomain(): DomainInfo {
        if (!this.domain) {
            throw new Error(`Check if the panel was initialized by calling 'isInitialized' first.`);
        }
        return this.domain;
    }

    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn || ViewColumn.Beside);
    }

    close() {
        this.panel.dispose();
    }

    setNeedsRebuild(needsRebuild: boolean) {
        this.needsRebuild = needsRebuild;
    }

    getNeedsRebuild(): boolean {
        return this.needsRebuild;
    }

    getPanel(): WebviewAdapter {
        return this.panel;
    }
}
