/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, ViewColumn} from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { WebviewAdapter } from './view';

export class ProblemInitPanel {

    private needsRebuild: boolean;
    private problem: ProblemInfo;
    private error: Error;
    private domain: DomainInfo;

    constructor(public uri: Uri, private panel: WebviewAdapter) { 
        panel.postMessage({ command: 'setIsInset', value: panel.isInset });
    }

    setDomainAndProblem(domain: DomainInfo, problem: ProblemInfo): void {
        this.domain = domain;
        this.problem = problem;
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

    getProblem(): ProblemInfo {
        return this.problem;
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
