/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, CodeActionProvider, CodeActionKind, Range, Selection, CodeActionContext, CancellationToken, CodeAction, Diagnostic } from 'vscode';
import { MissingRequirements } from './MissingRequirements';
import { utils } from 'pddl-workspace';
import { parser } from 'pddl-workspace';
import { FileInfo } from 'pddl-workspace';
import { PDDL } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PTEST_VIEW_PROBLEM } from '../ptest/PTestCommands';
import { Test } from '../ptest/Test';
import { TestsManifest } from '../ptest/TestsManifest';
import { basename } from 'path';
import { PreProcessor } from 'pddl-workspace';
import { UndeclaredVariable, VariableType } from './UndeclaredVariable';

/**
 * Provides code actions for PDDL files.
 */
export class SuggestionProvider implements CodeActionProvider {

    static readonly CONTENT_NOT_RECOGNIZED = 'CONTENT_NOT_RECOGNIZED';

    constructor(private workspace: CodePddlWorkspace) {
    }

    public static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];

    async provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext, token: CancellationToken): Promise<CodeAction[]> {
        if (token.isCancellationRequested) { return []; }

        let fileInfo = await this.workspace.upsertFile(document);
        if (fileInfo === undefined) { throw new Error(`Not a PDDL file: ` + document.uri.toString()); }
        let syntaxTree = new parser.PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();

        let insertSnippetCodeActions = context.diagnostics
            .filter(diagnostic => diagnostic.code === SuggestionProvider.CONTENT_NOT_RECOGNIZED)
            .map(diagnostic => this.createSnippetSuggestions(document, diagnostic, range, fileInfo!, syntaxTree));

        if (token.isCancellationRequested) { return []; }

        let missingRequirement = context.diagnostics
            .filter(diagnostic => diagnostic.message.match(MissingRequirements.undeclaredRequirementDiagnosticPattern))
            .map(diagnostic => this.createMissingRequirementAction(document, diagnostic, fileInfo!))
            .filter(action => !!action).map(action => action!);

        if (token.isCancellationRequested) { return []; }

        let undeclaredVariable = context.diagnostics
            .filter(diagnostic => diagnostic.message.match(UndeclaredVariable.undeclaredVariableDiagnosticPattern))
            .map(diagnostic => this.createUndeclaredVariableAction(document, diagnostic, fileInfo!))
            .filter(action => action !== undefined).map(action => action!);

        if (token.isCancellationRequested) { return []; }

        let problemSnippets = this.createProblemActions(fileInfo, document, range, context);

        return utils.Util.flatMap(insertSnippetCodeActions).concat(missingRequirement).concat(undeclaredVariable).concat(problemSnippets);
    }

    private createProblemActions(fileInfo: FileInfo, document: TextDocument, range: Range | Selection, _context: CodeActionContext): CodeAction[] {
        if (!fileInfo.isProblem()) { return []; }

        if (!(range instanceof Range)) { return []; }

        let problemInfo = <ProblemInfo>fileInfo;
        let preProcessor = problemInfo.getPreParsingPreProcessor();

        if (range.isSingleLine && preProcessor) {
            let focussedLine = document.lineAt(range.start.line);
            if (focussedLine.text.trim().match(/^;;\s*!pre-parsing:/)) {
                const title = "Preview generated problem file";
                let codeAction = new CodeAction(title, CodeActionKind.Empty);
                codeAction.command = { title: title, command: PTEST_VIEW_PROBLEM, arguments: [this.createTest(document, preProcessor)] };
                return [codeAction];
            }
        }
        return [];
    }

    private createTest(document: TextDocument, preProcessor: PreProcessor): Test {
        let test = new Test(preProcessor.getLabel(), "", "this should not be used",
            basename(document.uri.fsPath), "", preProcessor, []);
        test.setManifest(new TestsManifest('unused', 'unused', 'unused', document.uri)); // only the uri is needed
        return test;
    }

    private createSnippetSuggestions(document: TextDocument, diagnostic: Diagnostic, range: Range | Selection, fileInfo: FileInfo, syntaxTree: parser.PddlSyntaxTree): CodeAction[] {
        let isWhitespaceOnly = syntaxTree.getRootNode().getChildren()
            .every(node => node.isType(parser.PddlTokenType.Comment) || node.isType(parser.PddlTokenType.Whitespace));

        let selectedNode = syntaxTree.getNodeAt(document.offsetAt(range.start));
        let isInsideWhitespace = selectedNode &&
            (selectedNode.isType(parser.PddlTokenType.Whitespace)
                || selectedNode.isType(parser.PddlTokenType.Document));

        let codeActions: CodeAction[] = [];

        if (fileInfo.isUnknownPddl() && isInsideWhitespace && isWhitespaceOnly) {
            {
                const title = 'Insert PDDL domain snippet...';
                const action = new CodeAction(title, CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic];
                action.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'domain' }], title: title };
                action.isPreferred = true;
                codeActions.push(action);
            }
            {
                const title = 'Insert PDDL problem snippet...';
                const action = new CodeAction(title, CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic];
                action.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'problem' }], title: title };
                codeActions.push(action);
            }
        }

        return codeActions;
    }

    private createMissingRequirementAction(document: TextDocument, diagnostic: Diagnostic, fileInfo: FileInfo): CodeAction | undefined {

        let missingRequirementsDelegate = new MissingRequirements(fileInfo);

        let requirementName = missingRequirementsDelegate.getRequirementName(diagnostic.message);
        if (!requirementName) { return undefined; }

        let edit = missingRequirementsDelegate.createEdit(document, requirementName);

        const title = 'Add missing requirement ' + requirementName;
        const action = new CodeAction(title, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    private createUndeclaredVariableAction(document: TextDocument, diagnostic: Diagnostic, fileInfo: FileInfo): CodeAction | undefined {

        let undeclaredVariableDelegate = new UndeclaredVariable(fileInfo);

        const variableNode = undeclaredVariableDelegate.getVariable(diagnostic, document);
        if (!variableNode) { return undefined; }
        let [variable, node] = variableNode;

        let [edit, type] = undeclaredVariableDelegate.createEdit(document, variable, node);

        let sectionName: string;
        switch (type) {
            case VariableType.Function:
                sectionName = "function";
                break;
            case VariableType.Predicate:
                sectionName = "predicate";
                break;
            default:
                console.log(`Could not determine whether ${variable.getFullName()} is a predicate or a function.`);
                return undefined;
        }

        const title = `Add undeclared ${sectionName} (${variable.getFullName()})`;
        const action = new CodeAction(title, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }
}