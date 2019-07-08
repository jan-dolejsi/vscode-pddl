/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CodeActionKind, ExtensionContext, commands, languages, Uri, workspace, TextDocument } from 'vscode';
import { PLAN, ProblemInfo, PDDL, HAPPENINGS, DomainInfo } from '../../../common/src/parser';
import { AssociationCodeActionProvider } from './AssociationCodeActionProvider';
import { showError } from '../utils';
import { selectFile } from './workspaceUtils';
import { PddlLanguage, FileInfo } from '../../../common/src/FileInfo';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';

export const COMMAND_ASSOCIATE_PROBLEM = 'pddl.workspace.associateProblem';
export const COMMAND_ASSOCIATE_DOMAIN = 'pddl.workspace.associateDomain';

/**
 * Provides associations between workspace files that cannot be associated by natural links.
 */
export class AssociationProvider {
    constructor(context: ExtensionContext, private pddlWorkspace: PddlWorkspace) {
        context.subscriptions.push(
            commands.registerCommand(COMMAND_ASSOCIATE_PROBLEM, (planUri: Uri) =>
                this.associateProblem(planUri).catch(showError))
        );

        context.subscriptions.push(
            commands.registerCommand(COMMAND_ASSOCIATE_DOMAIN, (problemUri: Uri) =>
                this.associateDomain(problemUri, pddlWorkspace.getDomainFilesFor(pddlWorkspace.getFileInfo(problemUri.toString()))).catch(showError))
        );

        context.subscriptions.push(
            languages.registerCodeActionsProvider(PDDL, new AssociationCodeActionProvider(), { providedCodeActionKinds: [CodeActionKind.QuickFix] })
        );
        context.subscriptions.push(
            languages.registerCodeActionsProvider(PLAN, new AssociationCodeActionProvider(), { providedCodeActionKinds: [CodeActionKind.QuickFix] })
        );
        context.subscriptions.push(
            languages.registerCodeActionsProvider(HAPPENINGS, new AssociationCodeActionProvider(), { providedCodeActionKinds: [CodeActionKind.QuickFix] })
        );
    }

    static readonly PDDL_PATTERN = '**/*.pddl';

    private async associateProblem(planUri: Uri): Promise<void> {
        let problemUri = await selectFile({
            language: PddlLanguage.PDDL,
            promptMessage: 'Select the matching problem file...',
            findPattern: AssociationProvider.PDDL_PATTERN,
            fileOpenLabel: 'Select',
            fileOpenFilters: { 'PDDL Problem Files': ['pddl'] },
            workspaceFolder: workspace.getWorkspaceFolder(planUri)
        });
        if (problemUri) {
            let problemDocument = await workspace.openTextDocument(problemUri);
            //window.showTextDocument(problemDocument);
            await this.associatePlanToProblem(planUri, problemDocument);
        }
    }

    private async associatePlanToProblem(planUri: Uri, problemDocument: TextDocument): Promise<void> {
        let parsedFileInfo = await this.upsertAndParseFile(problemDocument);
        if (!(parsedFileInfo instanceof ProblemInfo)) {
            throw new Error("Selected file is not a problem file.");
        }
        let problemInfo = <ProblemInfo>parsedFileInfo;
        this.pddlWorkspace.associatePlanToProblem(planUri.toString(), problemInfo);
        console.log(`Associated ${problemDocument.uri} to ${planUri}.`);
        // re-validate the plan file
        let planInfo = this.pddlWorkspace.getFileInfo(planUri.toString());
        this.pddlWorkspace.invalidateDiagnostics(planInfo);
    }

    private async associateDomain(problemUri: Uri, suggestedFiles?: FileInfo[]): Promise<TextDocument> {
        let domainUri = await selectFile({
            language: PddlLanguage.PDDL,
            promptMessage: 'Select the matching domain file...',
            findPattern: AssociationProvider.PDDL_PATTERN,
            fileOpenLabel: 'Select',
            fileOpenFilters: { 'PDDL Domain Files': ['pddl'] },
            workspaceFolder: workspace.getWorkspaceFolder(problemUri)
        }, suggestedFiles);
        if (domainUri) {
            let domainDocument = await workspace.openTextDocument(domainUri);
            await this.associateDomainToProblem(problemUri, domainDocument);
            return domainDocument;
        }
        else {
            return null;
        }
    }
    private async associateDomainToProblem(problemUri: Uri, domainDocument: TextDocument): Promise<void> {
        let parsedFileInfo = await this.upsertAndParseFile(domainDocument);
        if (!(parsedFileInfo instanceof DomainInfo)) {
            throw new Error("Selected file is not a domain file.");
        }
        let domainInfo = <DomainInfo>parsedFileInfo;
        let problemInfo = this.pddlWorkspace.getFileInfo<ProblemInfo>(problemUri.toString());

        this.pddlWorkspace.associateProblemToDomain(problemInfo, domainInfo);
        console.log(`Associated ${domainDocument.uri} to ${problemUri}.`);
        // re-validate the problem file
        this.pddlWorkspace.invalidateDiagnostics(problemInfo);
        this.pddlWorkspace.getPlanFiles(problemInfo).forEach(planInfo => this.pddlWorkspace.invalidateDiagnostics(planInfo));
        this.pddlWorkspace.getHappeningsFiles(problemInfo).forEach(happeningsInfo => this.pddlWorkspace.invalidateDiagnostics(happeningsInfo));
    }

    private async upsertAndParseFile(document: TextDocument): Promise<FileInfo> {
        return await this.pddlWorkspace.upsertAndParseFile(document.uri.toString(), PddlLanguage.PDDL, document.version, document.getText());
    }

}
