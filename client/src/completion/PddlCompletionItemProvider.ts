/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext } from 'vscode';
import { UnknownFileInfo, ProblemInfo } from '../../../common/src/parser';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { DomainCompletionItemProvider } from './DomainCompletionItemProvider';
import { ProblemCompletionItemProvider } from './ProblemCompletionItemProvider';
import { UnknownPddlCompletionItemProvider } from './UnknownPddlCompletionItemProvider';

export class PddlCompletionItemProvider implements CompletionItemProvider {
    
    private domainProvider: DomainCompletionItemProvider;
    private problemProvider: ProblemCompletionItemProvider;
    private unknownProvider: UnknownPddlCompletionItemProvider;

    // For snippet syntax read this: https://code.visualstudio.com/docs/editor/userdefinedsnippets
    
    constructor(private codePddlWorkspace: CodePddlWorkspace) {
    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
        if (token.isCancellationRequested) { return null; }
        let fileInfo = this.codePddlWorkspace ? await this.codePddlWorkspace.upsertAndParseFile(document) : null;

        if (fileInfo instanceof DomainInfo) {
            return await (this.domainProvider || (this.domainProvider = new DomainCompletionItemProvider())).provide(document, <DomainInfo>fileInfo, position, context);
        }
        else if (fileInfo instanceof ProblemInfo) {
            return await (this.problemProvider || (this.problemProvider = new ProblemCompletionItemProvider())).provide(document, <ProblemInfo>fileInfo, position, context);
        }
        else if (fileInfo instanceof UnknownFileInfo || fileInfo === null) {
            return await (this.unknownProvider || (this.unknownProvider = new UnknownPddlCompletionItemProvider())).provide(document, position, context);
        } 

        return [];
    }
}