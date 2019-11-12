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

    private needsRebuild: boolean;
    private domain: DomainInfo;
    private error: Error;

    constructor(uri: Uri, panel: WebviewAdapter) {
        super(uri, panel);
    }

    setDomain(domain: DomainInfo): void {
        this.domain = domain;
        this.error = null;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;
    }

    getError(): Error {
        return this.error;
    }

    getDomain(): DomainInfo {
        return this.domain;
    }

    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn);
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
