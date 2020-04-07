/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CodeActionKind, ExtensionContext, languages, Uri, workspace, TextDocument } from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { PLAN, PDDL, HAPPENINGS } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { AssociationCodeActionProvider } from './AssociationCodeActionProvider';
import { showError } from '../utils';
import { selectFile } from './workspaceUtils';
import { PddlLanguage, FileInfo } from 'pddl-workspace';
import { CodePddlWorkspace } from './CodePddlWorkspace';

export const COMMAND_ASSOCIATE_PROBLEM = 'pddl.workspace.associateProblem';
export const COMMAND_ASSOCIATE_DOMAIN = 'pddl.workspace.associateDomain';

/**
 * Provides associations between workspace files that cannot be associated by natural links.
 */
export class AssociationProvider {
    constructor(context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace) {
        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(COMMAND_ASSOCIATE_PROBLEM, (planUri: Uri) =>
                this.associateProblem(planUri).catch(showError))
        );

        context.subscriptions.push(
            instrumentOperationAsVsCodeCommand(COMMAND_ASSOCIATE_DOMAIN, async (problemUri: Uri) => {
                const problemDocument = await workspace.openTextDocument(problemUri);
                const problemFileInfo = codePddlWorkspace.getFileInfo(problemDocument) as ProblemInfo;
                this.associateDomain(problemUri, codePddlWorkspace.pddlWorkspace.getDomainFilesFor(problemFileInfo)).catch(showError);
            })
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
        const problemUri = await selectFile({
            language: PddlLanguage.PDDL,
            promptMessage: 'Select the matching problem file...',
            findPattern: AssociationProvider.PDDL_PATTERN,
            fileOpenLabel: 'Select',
            fileOpenFilters: { 'PDDL Problem Files': ['pddl'] },
            workspaceFolder: workspace.getWorkspaceFolder(planUri)
        });
        if (problemUri) {
            const problemDocument = await workspace.openTextDocument(problemUri);
            //window.showTextDocument(problemDocument);
            await this.associatePlanToProblem(planUri, problemDocument);
        }
    }

    private async associatePlanToProblem(planUri: Uri, problemDocument: TextDocument): Promise<void> {
        const parsedFileInfo = await this.codePddlWorkspace.upsertAndParseFile(problemDocument);
        if (!(parsedFileInfo instanceof ProblemInfo)) {
            throw new Error("Selected file is not a problem file.");
        }
        const problemInfo = parsedFileInfo as ProblemInfo;
        this.codePddlWorkspace.pddlWorkspace.associatePlanToProblem(planUri.toString(), problemInfo);
        console.log(`Associated ${problemDocument.uri} to ${planUri}.`);
        // re-validate the plan file
        const planInfo = this.codePddlWorkspace.getFileInfoByUri(planUri);
        if (planInfo !== undefined) {
            this.codePddlWorkspace.pddlWorkspace.invalidateDiagnostics(planInfo);
        } else {
            console.log("Plan not found in the workspace model: " + planUri);
        }
    }

    private async associateDomain(problemUri: Uri, suggestedFiles?: FileInfo[]): Promise<TextDocument | undefined> {
        const domainUri = await selectFile({
            language: PddlLanguage.PDDL,
            promptMessage: 'Select the matching domain file...',
            findPattern: AssociationProvider.PDDL_PATTERN,
            fileOpenLabel: 'Select',
            fileOpenFilters: { 'PDDL Domain Files': ['pddl'] },
            workspaceFolder: workspace.getWorkspaceFolder(problemUri)
        }, suggestedFiles);
        if (domainUri) {
            const domainDocument = await workspace.openTextDocument(domainUri);
            await this.associateDomainToProblem(problemUri, domainDocument);
            return domainDocument;
        }
        else {
            return undefined;
        }
    }
    private async associateDomainToProblem(problemUri: Uri, domainDocument: TextDocument): Promise<void> {
        const parsedFileInfo = await this.codePddlWorkspace.upsertAndParseFile(domainDocument);
        if (!(parsedFileInfo instanceof DomainInfo)) {
            throw new Error("Selected file is not a domain file.");
        }
        const domainInfo = parsedFileInfo as DomainInfo;
        const problemInfo = this.codePddlWorkspace.getFileInfoByUri<ProblemInfo>(problemUri);
        if (problemInfo === undefined) { 
            throw new Error(`Problem file ${problemUri} not found in the workspace model.`);
        }

        this.codePddlWorkspace.pddlWorkspace.associateProblemToDomain(problemInfo, domainInfo);
        console.log(`Associated ${domainDocument.uri} to ${problemUri}.`);
        // re-validate the problem file
        const pddlWorkspace = this.codePddlWorkspace.pddlWorkspace;
        pddlWorkspace.invalidateDiagnostics(problemInfo);
        pddlWorkspace.getPlanFiles(problemInfo).forEach(planInfo => pddlWorkspace.invalidateDiagnostics(planInfo));
        pddlWorkspace.getHappeningsFiles(problemInfo).forEach(happeningsInfo => pddlWorkspace.invalidateDiagnostics(happeningsInfo));
    }
}
