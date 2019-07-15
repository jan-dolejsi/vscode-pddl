/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, window, workspace, QuickPickItem, Uri, GlobPattern, WorkspaceFolder } from 'vscode';
import { PDDL, PLAN, toLanguageFromId, HAPPENINGS, PlanInfo, ProblemInfo, DomainInfo, UNSPECIFIED_PROBLEM, UNSPECIFIED_DOMAIN } from '../../../common/src/parser';
import { PddlLanguage, FileInfo } from '../../../common/src/FileInfo';
import { HappeningsInfo } from "../../../common/src/HappeningsInfo";
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { basename, dirname } from 'path';

export function isAnyPddl(doc: TextDocument): boolean {
    return isPddl(doc) || isPlan(doc) || isHappenings(doc);
}

export function isPddl(doc: TextDocument): boolean {
    return doc.languageId === PDDL && doc.uri.scheme !== "git";
}

export function isPlan(doc: TextDocument): boolean {
    return doc.languageId === PLAN && doc.uri.scheme !== "git";
}

export function isHappenings(doc: TextDocument): boolean {
    return doc.languageId === HAPPENINGS && doc.uri.scheme !== "git";
}

export function toLanguage(doc: TextDocument): PddlLanguage {
    return toLanguageFromId(doc.languageId);
}

export function getDomainFileForProblem(problemFile: ProblemInfo, pddlWorkspace: PddlWorkspace): DomainInfo {
    // find domain files in the same folder that match the problem's domain name
    let domainFiles = pddlWorkspace.getDomainFilesFor(problemFile);

    if (domainFiles.length > 1) {
        let candidates = domainFiles.map(d => PddlWorkspace.getFileName(d.fileUri)).join(', ');
        let message = `There are multiple candidate domains with name ${problemFile.domainName}: ${candidates}. Click 💡 to select it...`;
        throw new NoDomainAssociated(problemFile, message);
    }
    else if (domainFiles.length === 0) {
        let message = `There are no domains open in the same folder with name (domain '${problemFile.domainName}') open in the editor. Click 💡 to select it...`;
        throw new NoDomainAssociated(problemFile, message);
    }
    else {
        return domainFiles[0];
    }
}

export function getDomainAndProblemForPlan(planInfo: PlanInfo, pddlWorkspace: PddlWorkspace): DomainAndProblem {
    let problemFileInfo = pddlWorkspace.getProblemFileForPlan(planInfo);

    if (!problemFileInfo) { throw new NoProblemAssociated(planInfo); }

    let domainFileInfo = pddlWorkspace.getDomainFileFor(problemFileInfo);

    if (!domainFileInfo) { throw new NoDomainAssociated(problemFileInfo); }

    return { problem: problemFileInfo, domain: domainFileInfo };
}

export class NoProblemAssociated extends Error {
    constructor(public readonly plan: PlanInfo) {
        super(NoProblemAssociated.getMessage(plan));
    }

    static readonly DIAGNOSTIC_CODE = "NoAssociatedProblem";

    static getMessage(plan: PlanInfo): string {
        if (plan.problemName !== UNSPECIFIED_PROBLEM) {
            return `No problem file with name '(problem ${plan.problemName})' and located in the same folder as the plan is open in the editor. Click 💡 to select it...`;
        }
        else {
            return `No problem file is associated with the plan file. Click 💡 to select it...`;
        }
    }
}

export class NoDomainAssociated extends Error {
    constructor(public readonly problem: ProblemInfo, message?: string) {
        super(message || NoDomainAssociated.getMessage(problem));
    }

    static readonly DIAGNOSTIC_CODE = "NoAssociatedDomain";

    static getMessage(problem: ProblemInfo): string {
        if (problem.domainName !== UNSPECIFIED_DOMAIN) {
            return `No domain file with name '(define ${problem.domainName})' and located in the same folder is open in the editor. Click 💡 to select it...`;
        }
        else {
            return `No domain file is associated with this problem file. Click 💡 to select it...`;
        }
    }
}

export function getDomainAndProblemForHappenings(happeningsInfo: HappeningsInfo, pddlWorkspace: PddlWorkspace): DomainAndProblem {
    let problemFileInfo = pddlWorkspace.getProblemFileForHappenings(happeningsInfo);

    if (!problemFileInfo) {
        throw new Error(`No problem file with name '(problem ${happeningsInfo.problemName}') and located in the same folder as the plan is open in the editor.`);
    }

    let domainFileInfo = pddlWorkspace.getDomainFileFor(problemFileInfo);

    if (!domainFileInfo) {
        throw new Error(`No domain file corresponding to problem '${problemFileInfo.name}' and located in the same folder is open in the editor.`);
    }

    return { problem: problemFileInfo, domain: domainFileInfo };
}

export interface DomainAndProblem {
    readonly domain: DomainInfo;
    readonly problem: ProblemInfo;
}

export async function selectHappenings(): Promise<string> {
    // is a happenings file currently active?
    if (window.activeTextEditor && isHappenings(window.activeTextEditor.document)) {
        return window.activeTextEditor.document.uri.fsPath;
    }

    let workspaceFolder = window.activeTextEditor && window.activeTextEditor.document ?
        workspace.getWorkspaceFolder(window.activeTextEditor.document.uri) : null;

    let happeningsUri = await selectFile({
        language: PddlLanguage.HAPPENINGS,
        promptMessage: 'Select happenings file to debug...',
        findPattern: '**/*.happenings',
        fileOpenLabel: 'Start debugging',
        fileOpenFilters: { 'PDDL Plan Happenings': ['happenings'] },
        workspaceFolder: workspaceFolder
    });

    window.showTextDocument(happeningsUri);
    return happeningsUri.fsPath;
}

async function selectTextDocument(options: SelectFileOptions, textDocuments: TextDocument[]): Promise<TextDocument> {
    let openDocumentPicks = textDocuments.map(d => new TextDocumentQuickPickItem(d));
    let items: DocumentQuickPickItem[] = [...openDocumentPicks, anotherDocumentQuickPickItem];
    let selectedOpenDocument = await window.showQuickPick(items, { canPickMany: false, placeHolder: options.promptMessage });
    if (!selectedOpenDocument) {
        return null;
    } else if (selectedOpenDocument !== anotherDocumentQuickPickItem) {
        return selectedOpenDocument.getTextDocument();
    } else {
        return undefined; // the user selected that they want to continue to the wider list selection
    }
}

/**
 * Selects a document given th criteria in the _options_
 * @param options select file options
 * @param suggestedFiles files that the PddlWorkspace identified as candidates
 */
export async function selectFile(options: SelectFileOptions, suggestedFiles?: FileInfo[]): Promise<Uri> {
    // 0. is one of the suggested text documents the right one?
    if (suggestedFiles && suggestedFiles.length) {
        let openFileInfoPicks = suggestedFiles.map(d => new SuggestedFileInfoQuickPickItem(d));
        let items: FileInfoQuickPickItem[] = [...openFileInfoPicks, anotherDocumentFileInfoQuickPickItem];
        let selectedPick = await window.showQuickPick(items, { canPickMany: false, placeHolder: options.promptMessage });
        if (!selectedPick) {
            return null;
        } else if (selectedPick !== anotherDocumentFileInfoQuickPickItem) {
            return Uri.parse(selectedPick.getFileInfo().fileUri);
        }
    }

    // 1. is there a suitable file open in the editor?
    {
        let openDocs = workspace.textDocuments.filter(doc => toLanguage(doc) === options.language);
        let selectedTextDocument = await selectTextDocument(options, openDocs);
        if (selectedTextDocument) {
            return selectedTextDocument.uri;
        } else if (selectedTextDocument === null) {
            return null;
        }
    }

    // 2. else, select a file in the workspace
    {
        let workspaceFileUris = await workspace.findFiles(options.findPattern, '.git/**', 100);

        let workspaceFilePicks = workspaceFileUris.map(uri => new WorkspaceUriQuickPickItem(uri));
        let items = [...workspaceFilePicks, anotherLocalFileQuickPickItem];
        let workspaceFileUriPicked = await window.showQuickPick(items, { canPickMany: false, placeHolder: options.promptMessage });
        if (!workspaceFileUriPicked) {
            return null;
        } else if (workspaceFileUriPicked !== anotherLocalFileQuickPickItem) {
            return workspaceFileUriPicked.getUri();
        }
    }

    // 3. else select a file from the local disk
    {
        let defaultUri = options.workspaceFolder ? options.workspaceFolder.uri : undefined;
        let selectedHappeningsUris = await window.showOpenDialog({
            defaultUri: defaultUri,
            canSelectFiles: true, canSelectFolders: false,
            canSelectMany: false,
            openLabel: options.fileOpenLabel,
            filters: options.fileOpenFilters
        });

        if (selectedHappeningsUris && selectedHappeningsUris.length > 0) {
            return selectedHappeningsUris[0];
        }
        else {
            // nothing was selected
            return null;
        }
    }
}

export interface SelectFileOptions {
    /** Target file language. */
    language: PddlLanguage;
    /** Message for the file selection drop down e.g. 'Select a problem file...' */
    promptMessage: string;
    /** Find pattern e.g. **//*.pddl */
    findPattern: GlobPattern;
    /** File open dialog button label e.g. 'Select' */
    fileOpenLabel: string;
    /**
     * File open dialog pattern: `{ 'PDDL Plan Happenings': ['happenings'] }`
    */
    fileOpenFilters: { [name: string]: string[] };
    /** default workspace folder to look in */
    workspaceFolder?: WorkspaceFolder;
}

interface FileInfoQuickPickItem extends QuickPickItem {
    getFileInfo(): FileInfo;
}

const anotherDocumentFileInfoQuickPickItem: FileInfoQuickPickItem = {
    label: 'Select another file in the workspace...',
    alwaysShow: true,
    getFileInfo(): FileInfo {
        throw new Error('do not ask!');
    }
};

class SuggestedFileInfoQuickPickItem implements FileInfoQuickPickItem {
    readonly label: string;
    readonly description: string;
    constructor(private fileInfo: FileInfo) {
        let filePath = Uri.parse(fileInfo.fileUri).fsPath;
        this.label = basename(filePath);
        this.description = dirname(filePath);
    }

    getFileInfo(): FileInfo {
        return this.fileInfo;
    }
}

interface DocumentQuickPickItem extends QuickPickItem {
    getTextDocument(): TextDocument;
}

const anotherDocumentQuickPickItem: DocumentQuickPickItem = {
    label: 'Select another file in the workspace...',
    alwaysShow: true,
    getTextDocument(): TextDocument {
        throw new Error('do not ask!');
    }
};

class TextDocumentQuickPickItem implements DocumentQuickPickItem {
    readonly label: string;
    readonly description: string;

    constructor(private doc: TextDocument) {
        this.label = basename(doc.fileName);
        this.description = dirname(doc.fileName);
    }

    getTextDocument(): TextDocument {
        return this.doc;
    }
}

interface UriQuickPickItem extends QuickPickItem {
    getUri(): Uri;
}

const anotherLocalFileQuickPickItem: UriQuickPickItem = {
    label: 'Select another file...',
    alwaysShow: true,
    getUri(): Uri {
        throw new Error('do not ask!');
    }
};

class WorkspaceUriQuickPickItem implements UriQuickPickItem {
    readonly label: string;
    readonly description: string;
    constructor(private uri: Uri) {
        this.label = basename(uri.fsPath);
        this.description = dirname(uri.fsPath);
    }

    getUri(): Uri {
        return this.uri;
    }
}
