/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, TextDocument, ExtensionContext, workspace, window, TextEditorRevealType } from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { toLanguage, isAnyPddl } from './workspaceUtils';
import { FileInfo } from '../../../common/src/FileInfo';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { DocumentPositionResolver } from '../../../common/src/DocumentPositionResolver';
import { CodeDocumentPositionResolver } from './CodeDocumentPositionResolver';
import * as afs from '../../../common/src/asyncfs';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { toRange } from '../utils';
import { PddlConfiguration } from '../configuration';
import { ProblemInfo } from '../../../common/src/ProblemInfo';


export class CodePddlWorkspace {

    /**
     * VS Code wrapper for the PDDL workspace model
     * @param pddlWorkspace underlying PDDL workspace model
     * @param context Code extension context. When not supplied, the instance is for testing only.
     * @param pddlConfiguration pddl extension configuration. When not supplied , the instance is for testing only.
     */
    private constructor(public readonly pddlWorkspace: PddlWorkspace, context?: ExtensionContext, pddlConfiguration?: PddlConfiguration) {
        let revealActionCommand = instrumentOperationAsVsCodeCommand('pddl.revealAction', (domainFileUri: Uri, actionName: String) => {
            revealAction(<DomainInfo>pddlWorkspace.getFileInfo(domainFileUri.toString()), actionName);
        });

        if (context) { // unit tests do not clean-up
            subscribeToWorkspace(this, context, pddlConfiguration);
            context.subscriptions.push(revealActionCommand);
        }
    }

    static getInstance(pddlWorkspace: PddlWorkspace, context: ExtensionContext, pddlConfiguration: PddlConfiguration) {
        return new CodePddlWorkspace(pddlWorkspace, context, pddlConfiguration);
    }

    static getInstanceForTestingOnly(pddlWorkspace: PddlWorkspace): CodePddlWorkspace {
        return new CodePddlWorkspace(pddlWorkspace);
    }

    async upsertFile(document: TextDocument, force: boolean = false): Promise<FileInfo | undefined> {
        const language = toLanguage(document);
        if (language === undefined) { return undefined; }
        return await this.pddlWorkspace.upsertFile(document.uri.toString(),
            language, document.version, document.getText(),
            this.createPositionResolver(document), force);
    }

    async upsertAndParseFile(document: TextDocument): Promise<FileInfo | undefined> {
        const language = toLanguage(document);
        if (language === undefined) { return undefined; }
        return this.pddlWorkspace.upsertAndParseFile(document.uri.toString(), language, document.version, document.getText(), this.createPositionResolver(document));
    }

    getFileInfoByUri<T extends FileInfo>(uri: Uri): T | undefined {
        return this.pddlWorkspace.getFileInfo(uri.toString());
    }

    getFileInfo<T extends FileInfo>(document: TextDocument): T | undefined {
        return this.getFileInfoByUri(document.uri);
    }

    async removeFile(textDoc: TextDocument): Promise<boolean> {
        let fileExists = await afs.exists(textDoc.fileName);
        return this.pddlWorkspace.removeFile(textDoc.uri.toString(), { removeAllReferences: !fileExists });
    }

    getDomainFilesFor(problemFileInfo: ProblemInfo): DomainInfo[] {
        let domainFiles = this.pddlWorkspace.getDomainFilesFor(problemFileInfo);

        return domainFiles
            .filter(domainInfo => this.isRealFile(domainInfo));
    }

    private static readonly GIT_SCHEME = "git";

    private isRealFile(domainInfo: DomainInfo): boolean {
        return Uri.parse(domainInfo.fileUri).scheme !== CodePddlWorkspace.GIT_SCHEME;
    }

    static isRealDocument(document: TextDocument): boolean {
        return document.uri.scheme !== this.GIT_SCHEME;
    }

    setEpsilon(epsilon: number): void {
        this.pddlWorkspace.epsilon = epsilon;
    }

    private createPositionResolver(document: TextDocument): DocumentPositionResolver {
        return new CodeDocumentPositionResolver(document);
    }
}

function subscribeToWorkspace(pddlWorkspace: CodePddlWorkspace, context: ExtensionContext, pddlConfiguration?: PddlConfiguration): void {
    // add all open documents
    workspace.textDocuments
        .filter(textDoc => isAnyPddl(textDoc))
        .filter(textDoc => CodePddlWorkspace.isRealDocument(textDoc))
        .forEach(textDoc => {
            pddlWorkspace.upsertFile(textDoc);
        });

    // subscribe to document opening event
    context.subscriptions.push(workspace.onDidOpenTextDocument(textDoc => {
        if (isAnyPddl(textDoc) && CodePddlWorkspace.isRealDocument(textDoc)) {
            pddlWorkspace.upsertFile(textDoc);
        }
    }));

    // subscribe to document changing event
    context.subscriptions.push(workspace.onDidChangeTextDocument(docEvent => {
        if (isAnyPddl(docEvent.document) && CodePddlWorkspace.isRealDocument(docEvent.document)) {
            pddlWorkspace.upsertFile(docEvent.document);
        } else {
            // for all problem files that pre-parse using data from this updated document, re-validate
            pddlWorkspace.pddlWorkspace.getAllFilesIf<ProblemInfo>(f => f.isProblem())

                .filter(problemInfo => !!problemInfo.getPreParsingPreProcessor())
                .filter(problemInfo => problemInfo.getPreParsingPreProcessor()!.getInputFiles().some(inputFile => docEvent.document.fileName.endsWith(inputFile)))
                .forEach(async (problemInfo) => {
                    let problemFile = await workspace.openTextDocument(Uri.parse(problemInfo.fileUri));
                    pddlWorkspace.upsertFile(problemFile, true);
                });
        }
    }));

    // subscribe to document closing event
    context.subscriptions.push(workspace.onDidCloseTextDocument(async (textDoc) => {
        if (isAnyPddl(textDoc) && CodePddlWorkspace.isRealDocument(textDoc)) { await pddlWorkspace.removeFile(textDoc); }
    }));

    if (pddlConfiguration) {
        workspace.onDidChangeConfiguration(_ => {
            pddlWorkspace.setEpsilon(pddlConfiguration.getEpsilonTimeStep());
        });
    }
}

async function revealAction(domainInfo: DomainInfo, actionName: String) {
    let document = await workspace.openTextDocument(Uri.parse(domainInfo.fileUri));
    let actionFound = domainInfo.getActions().find(a => a?.name?.toLowerCase() === actionName.toLowerCase());
    let actionRange = actionFound && toRange(actionFound.getLocation());
    let openEditor = window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString());
    if (openEditor && actionRange) {
        openEditor.revealRange(actionRange, TextEditorRevealType.AtTop);
    } else {
        window.showTextDocument(document.uri, { preserveFocus: true, selection: actionRange, preview: true });
    }
}