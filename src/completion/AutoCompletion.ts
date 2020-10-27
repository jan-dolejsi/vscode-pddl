/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext, Range } from 'vscode';
import { ProblemInfo } from 'pddl-workspace';
import { ProblemInitDelegate } from './ProblemInitDelegate';
import { OperatorDelegate } from './OperatorDelegate';
import { VariableDelegate } from './VariableDelegate';
import { TypeDelegate } from './TypeDelegate';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';

export class AutoCompletion implements CompletionItemProvider {

    // For snippet syntax read this: https://code.visualstudio.com/docs/editor/userdefinedsnippets

    private operatorDelegate: OperatorDelegate;
    private variableDelegate: VariableDelegate;
    private typeDelegate: TypeDelegate;

    constructor(public codePddlWorkspace: CodePddlWorkspace) {
        this.operatorDelegate = new OperatorDelegate();
        this.variableDelegate = new VariableDelegate(codePddlWorkspace);
        this.typeDelegate = new TypeDelegate(codePddlWorkspace.pddlWorkspace);
    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
        if (token.isCancellationRequested) { return []; }

        const completionCollector = await new CompletionCollector(this.codePddlWorkspace, document, position, context,
            this.operatorDelegate, this.variableDelegate, this.typeDelegate).initialize();
        return completionCollector.getCompletions();
    }
}

class CompletionCollector {
    private completions: CompletionItem[] = [];

    private lineText: string;
    private leadingText: string;

    constructor(private readonly codePddlWorkspace: CodePddlWorkspace, private readonly document: TextDocument,
        private readonly position: Position, private readonly context: CompletionContext,
        private readonly operatorDelegate: OperatorDelegate,
        private readonly variableDelegate: VariableDelegate,
        private readonly typeDelegate: TypeDelegate) {

        this.lineText = document.lineAt(position.line).text;
        this.leadingText = this.lineText.substring(0, position.character);
    }

    async initialize(): Promise<CompletionCollector> {
        if (this.leadingText.includes(';')) { return this; } // do not auto-complete in comment text

        const activeFileInfo = await this.codePddlWorkspace.upsertFile(this.document);

        if (!activeFileInfo) { return this; }

        if (activeFileInfo.isProblem()) {
            const problemFileInfo = activeFileInfo as ProblemInfo;

            this.createProblemCompletionItems(problemFileInfo);
        }

        if (this.leadingText.length > 0 && this.leadingText.endsWith('(')) {
            this.pushAll(this.operatorDelegate.getOperatorItems());
            this.pushAll(this.variableDelegate.getVariableItems(activeFileInfo));
        } else if (this.leadingText.endsWith(' -')) {
            this.pushAll(this.typeDelegate.getTypeItems(activeFileInfo));
        }

        return this;
    }

    getCompletions(): CompletionItem[] {
        return this.completions;
    }

    createProblemCompletionItems(problemFileInfo: ProblemInfo): void {
        const folder = this.codePddlWorkspace.pddlWorkspace.getFolderOf(problemFileInfo);
        // find domain files in the same folder that match the problem's domain name
        const domainFiles = folder?.getDomainFilesFor(problemFileInfo) ?? [];

        if (this.isInInit()) {
            new ProblemInitDelegate(this.completions, this.context).createProblemInitCompletionItems(problemFileInfo, domainFiles);
        }
    }

    pushAll(items: CompletionItem[]): void {
        this.completions.push(...items);
    }

    isTriggeredByBracket(): boolean {
        return this.leadingText.length > 0 && this.leadingText.endsWith('(');
    }

    isInInit(): boolean {
        const startPosition = new Position(0, 0);
        const endPosition = new Position(this.document.lineCount, 10000);

        return this.document.getText(new Range(startPosition, this.position)).includes('(:init')
            && this.document.getText(new Range(this.position, endPosition)).includes('(:goal');
    }
}
