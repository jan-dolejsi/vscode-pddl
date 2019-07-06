/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, window, workspace, QuickPickItem, Uri, ExtensionContext } from 'vscode';
import { PDDL, PLAN, toLanguageFromId, HAPPENINGS, PlanInfo, ProblemInfo, DomainInfo } from '../../common/src/parser';
import { PddlLanguage } from '../../common/src/FileInfo';
import { HappeningsInfo } from "../../common/src/HappeningsInfo";
import { PddlWorkspace } from '../../common/src/PddlWorkspace';
import { PddlExtensionContext } from '../../common/src/PddlExtensionContext';
import * as afs from '../../common/src/asyncfs';
import { basename, join } from 'path';

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

export function getDomainAndProblemForPlan(planInfo: PlanInfo, pddlWorkspace: PddlWorkspace): DomainAndProblem {
    let problemFileInfo = pddlWorkspace.getProblemFileForPlan(planInfo);

    if (!problemFileInfo) { throw new Error(`No problem file with name '(problem ${planInfo.problemName}') and located in the same folder as the plan is open in the editor.`); }

    let domainFileInfo = pddlWorkspace.getDomainFileFor(problemFileInfo);

    if (!domainFileInfo) { throw new Error(`No domain file corresponding to problem '${problemFileInfo.name}' and located in the same folder is open in the editor.`); }

    return { problem: problemFileInfo, domain: domainFileInfo };
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

    // is there a happenings file open in the workspace?
    let openHappeningsDocs = workspace.textDocuments.filter(doc => toLanguage(doc) === PddlLanguage.HAPPENINGS);

    if (openHappeningsDocs.length > 0) {
        let happeningsPathPicked = await window.showQuickPick(openHappeningsDocs.map(d => new TextDocumentQuickPickItem(d)), { canPickMany: false, placeHolder: 'Select happenings file to debug...' });
        if (happeningsPathPicked) {
            window.showTextDocument(happeningsPathPicked.getTextDocument());
            return happeningsPathPicked.getTextDocument().uri.fsPath;
        }
    }

    // else, is there a happenings file in the workspace?
    let workspaceHappeningsUris = await workspace.findFiles('**/*.happenings', '.git/**', 100);

    if (workspaceHappeningsUris.length > 0) {
        let happeningsUriPicked = await window.showQuickPick(workspaceHappeningsUris.map(uri => new UriQuickPickItem(uri)), { canPickMany: false, placeHolder: 'Select happenings file to debug...' });
        if (happeningsUriPicked) {
            window.showTextDocument(happeningsUriPicked.getUri());
            return happeningsUriPicked.getUri().fsPath;
        }
    }

    // else select a file from the disk

    let workspaceFolder = workspace.workspaceFolders.find(_ => true);
    let defaultUri = workspaceFolder ? workspaceFolder.uri : undefined;
    let selectedHappeningsUris = await window.showOpenDialog({ defaultUri: defaultUri, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: 'Start debugging', filters: { 'PDDL Plan Happenings': ['happenings'] } });

    if (selectedHappeningsUris && selectedHappeningsUris.length > 0) {
        window.showTextDocument(selectedHappeningsUris[0]);
        return selectedHappeningsUris[0].fsPath;
    }
    // nothing was selected
    return null;
}

class TextDocumentQuickPickItem implements QuickPickItem {
    label: string;
    description: string;
    constructor(private doc: TextDocument) {
        this.label = basename(doc.fileName);
        this.description = doc.fileName;
    }

    getTextDocument(): TextDocument {
        return this.doc;
    }
}

class UriQuickPickItem implements QuickPickItem {
    label: string;
    description: string;
    constructor(private uri: Uri) {
        this.label = basename(uri.fsPath);
        this.description = uri.fsPath;
    }

    getUri(): Uri {
        return this.uri;
    }
}

export function createPddlExtensionContext(context: ExtensionContext): PddlExtensionContext {
    return {
        asAbsolutePath: context.asAbsolutePath,
        extensionPath: context.extensionPath,
        storagePath: context.storagePath,
        subscriptions: context.subscriptions,
        pythonPath: () => workspace.getConfiguration().get("python.pythonPath", "python")
    };
}

export async function getWebViewHtml(extensionContext: PddlExtensionContext, relativePath: string, htmlFileName: string) {
    let overviewHtmlPath = extensionContext.asAbsolutePath(join(relativePath, htmlFileName));
    let html = await afs.readFile(overviewHtmlPath, { encoding: "utf-8", flag: 'r' });

    html = html.replace(/<(script|img|link) ([^>]*)(src|href)="([^"]+)"/g, (sourceElement: string, elementName: string, middleBits: string, attribName: string, attribValue: string) => {
        if (attribValue.startsWith('http')) {
            return sourceElement;
        }
        let resource = Uri.file(
            extensionContext.asAbsolutePath(join(relativePath, attribValue)))
            .with({ scheme: "vscode-resource" });
        return `<${elementName} ${middleBits}${attribName}="${resource}"`;
    });

    return html;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export function firstIndex<T>(array: T[], fn: (t: T) => boolean): number {
    for (let i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }

    return -1;
}

export function compareMaps(map1: Map<string, string>, map2: Map<string, string>) {
    var testVal;
    if (map1.size !== map2.size) {
        return false;
    }
    for (var [key, val] of map1) {
        testVal = map2.get(key);
        // in cases of an undefined value, make sure the key
        // actually exists on the object so there are no false positives
        if (testVal !== val || (testVal === undefined && !map2.has(key))) {
            return false;
        }
    }
    return true;
}

/**
 * Relative fuzzy time in a human readable form.
 * @param time date time
 */
export function toFuzzyRelativeTime(time: number): string {
    var delta = Math.round((+new Date - time) / 1000);

    var minute = 60,
        hour = minute * 60,
        day = hour * 24;

    var fuzzy;

    if (delta < 30) {
        fuzzy = 'just now';
    } else if (delta < minute) {
        fuzzy = delta + ' seconds ago';
    } else if (delta < 2 * minute) {
        fuzzy = 'a minute ago';
    } else if (delta < hour) {
        fuzzy = Math.floor(delta / minute) + ' minutes ago';
    } else if (Math.floor(delta / hour) === 1) {
        fuzzy = '1 hour ago';
    } else if (delta < day) {
        fuzzy = Math.floor(delta / hour) + ' hours ago';
    } else if (delta < day * 2) {
        fuzzy = 'yesterday';
    }
    else {
        fuzzy = Math.floor(delta / day) + ' days ago';
    }

    return fuzzy;
}