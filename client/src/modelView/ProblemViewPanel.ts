/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, ViewColumn } from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { WebviewAdapter } from './view';
import { BaseViewPanel } from './BaseViewPanel';

export class ProblemViewPanel extends BaseViewPanel {

    private needsRebuild = false;
    private problem: ProblemInfo | undefined;
    private error: Error | undefined;
    private domain: DomainInfo | undefined;

    constructor(uri: Uri, panel: WebviewAdapter) {
        super(uri, panel);
    }

    setDomainAndProblem(domain: DomainInfo, problem: ProblemInfo): void {
        this.domain = domain;
        this.problem = problem;
        this.error = undefined;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;
    }

    getError(): Error | undefined {
        return this.error;
    }

    isInitialized(): boolean {
        return !!this.domain && !!this.problem;
    }

    getDomain(): DomainInfo {
        if (!this.domain) {
            throw new Error(`Check if the panel was initialized by calling 'isInitialized' first.`);
        }
        return this.domain!;
    }

    getProblem(): ProblemInfo {
        if (!this.problem) {
            throw new Error(`Check if the panel was initialized by calling 'isInitialized' first.`);
        }
        return this.problem!;
    }

    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn ?? ViewColumn.Beside);
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
