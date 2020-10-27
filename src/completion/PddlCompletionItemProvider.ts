/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext } from 'vscode';
import { UnknownFileInfo } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { DomainCompletionItemProvider } from './DomainCompletionItemProvider';
import { ProblemCompletionItemProvider } from './ProblemCompletionItemProvider';
import { UnknownPddlCompletionItemProvider } from './UnknownPddlCompletionItemProvider';

export class PddlCompletionItemProvider implements CompletionItemProvider {
    
    private domainProvider: DomainCompletionItemProvider | undefined;
    private problemProvider: ProblemCompletionItemProvider | undefined;
    private unknownProvider: UnknownPddlCompletionItemProvider | undefined;

    // For snippet syntax read this: https://code.visualstudio.com/docs/editor/userdefinedsnippets
    
    constructor(private codePddlWorkspace: CodePddlWorkspace) {
    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[] | undefined> {
        if (token.isCancellationRequested) { return undefined; }
        const fileInfo = await this.codePddlWorkspace?.upsertAndParseFile(document);

        if (fileInfo instanceof DomainInfo) {
            return await this.getOrCreateDomainCompletionItemProvider().provide(document, fileInfo as DomainInfo, position, context);
        }
        else if (fileInfo instanceof ProblemInfo) {
            return await this.getOrCreateProblemCompletionItemProvider().provide(document, fileInfo as ProblemInfo, position, context);
        }
        else if (fileInfo instanceof UnknownFileInfo || fileInfo === null) {
            return await this.getOrCreateUnknownFileItemProvider().provide(document, position, context);
        } 

        return [];
    }

    private getOrCreateDomainCompletionItemProvider(): DomainCompletionItemProvider {
        return this.domainProvider ?? (this.domainProvider = new DomainCompletionItemProvider());
    }

    private getOrCreateProblemCompletionItemProvider(): ProblemCompletionItemProvider {
        return this.problemProvider ?? (this.problemProvider = new ProblemCompletionItemProvider());
    }

    private getOrCreateUnknownFileItemProvider(): UnknownPddlCompletionItemProvider {
        return this.unknownProvider ?? (this.unknownProvider = new UnknownPddlCompletionItemProvider());
    }
}