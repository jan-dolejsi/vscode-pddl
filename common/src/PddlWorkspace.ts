/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, DomainInfo, ProblemInfo, UnknownFileInfo, PlanInfo } from './parser';
import { FileInfo, PddlLanguage, FileStatus } from './FileInfo';
import { HappeningsInfo } from "./HappeningsInfo";
import { Util } from './util';
import { dirname, basename } from 'path';
import { PddlExtensionContext } from './PddlExtensionContext';
import { EventEmitter } from 'events';

class Folder {
    files: Map<string, FileInfo> = new Map<string, FileInfo>();
    folderUri: string;

    constructor(folderUri: string) {
        this.folderUri = folderUri;
    }

    hasFile(fileUri: string): boolean {
        return this.files.has(fileUri);
    }

    get(fileUri: string): FileInfo {
        return this.files.get(fileUri);
    }

    add(fileInfo: FileInfo): void {
        this.files.set(fileInfo.fileUri, fileInfo);
    }

    remove(fileInfo: FileInfo): boolean {
        return this.files.delete(fileInfo.fileUri);
    }

    removeByUri(fileUri: string): boolean {
        return this.files.delete(fileUri);
    }

    getProblemFileWithName(problemName: string): ProblemInfo {
        return Array.from(this.files.values())
            .filter(value => value.isProblem())
            .map(value => <ProblemInfo>value)
            .find(problemInfo => lowerCaseEquals(problemInfo.name, problemName));
    }

    getProblemFilesFor(domainInfo: DomainInfo): ProblemInfo[] {
        return Array.from(this.files.values())
            .filter(value => value.isProblem())
            .map(f => <ProblemInfo>f)
            .filter(problemInfo => lowerCaseEquals(problemInfo.domainName, domainInfo.name));
    }

    getDomainFilesFor(problemInfo: ProblemInfo): DomainInfo[] {
        return Array.from(this.files.values())
            .filter(value => value.isDomain())
            .map(value => <DomainInfo>value)
            .filter(domainInfo => lowerCaseEquals(domainInfo.name, problemInfo.domainName));
    }
}

function lowerCaseEquals(first: string, second: string): boolean {
    if (first === null || first === undefined) { return second === null || second === undefined; }
    else if (second === null || second === undefined) { return first === null || first === undefined; }
    else { return first.toLowerCase() === second.toLowerCase(); }
}

export class PddlWorkspace extends EventEmitter {
    folders: Map<string, Folder> = new Map<string, Folder>();
    parser: Parser;
    timeout: NodeJS.Timer;
    defaultTimerDelayInSeconds = 1;

    public static INSERTED = Symbol("INSERTED");
    public static UPDATED = Symbol("UPDATED");
    public static REMOVING = Symbol("REMOVING");

    constructor(public epsilon: number, context?: PddlExtensionContext) {
        super();
        this.parser = new Parser(context);
    }

    static getFolderUri(documentUri: string): string {
        let documentPath = Util.fsPath(documentUri);
        return Util.replaceAll(dirname(documentPath), '\\', '/');
    }

    static getFileName(documentUri: string): string {
        let documentPath = Util.fsPath(documentUri);
        return basename(documentPath);
    }

    async upsertAndParseFile(fileUri: string, language: PddlLanguage, fileVersion: number, fileText: string): Promise<FileInfo> {
        let fileInfo = await this.upsertFile(fileUri, language, fileVersion, fileText);
        if (fileInfo.getStatus() === FileStatus.Dirty) {
            fileInfo = await this.reParseFile(fileInfo);
        }

        return fileInfo;
    }

    async upsertFile(fileUri: string, language: PddlLanguage, fileVersion: number, fileText: string): Promise<FileInfo> {

        let folderUri = PddlWorkspace.getFolderUri(fileUri);

        let folder = this.upsertFolder(folderUri);

        let fileInfo: FileInfo = folder.get(fileUri);
        if (fileInfo) {
            if (fileInfo.update(fileVersion, fileText)) {
                this.scheduleParsing();
            }
        }
        else {
            fileInfo = await this.insertFile(folder, fileUri, language, fileVersion, fileText);
        }

        return fileInfo;
    }

    private async insertFile(folder: Folder, fileUri: string, language: PddlLanguage, fileVersion: number, fileText: string): Promise<FileInfo> {
        let fileInfo = await this.parseFile(fileUri, language, fileVersion, fileText);
        folder.add(fileInfo);

        if (fileInfo.isDomain()) {
            this.markProblemsAsDirty(<DomainInfo>fileInfo);
        } else if (fileInfo.isProblem()) {
            this.markPlansAsDirty(<ProblemInfo>fileInfo);
        }

        this.emit(PddlWorkspace.UPDATED, fileInfo);
        this.emit(PddlWorkspace.INSERTED, fileInfo);
        return fileInfo;
    }

    invalidateDiagnostics(fileInfo: FileInfo): void {
        fileInfo.setStatus(FileStatus.Parsed);
        this.emit(PddlWorkspace.UPDATED, fileInfo);
    }

    markProblemsAsDirty(domainInfo: DomainInfo): void {
        this.getProblemFiles(domainInfo).forEach(problemInfo => {
            this.invalidateDiagnostics(problemInfo);
            this.markPlansAsDirty(problemInfo);
        });
    }

    markPlansAsDirty(problemInfo: ProblemInfo): void {
        this.getPlanFiles(problemInfo).forEach(planInfo => this.invalidateDiagnostics(planInfo));
        this.getHappeningsFiles(problemInfo).forEach(happeningsInfo => this.invalidateDiagnostics(happeningsInfo));
    }

    scheduleParsing(): void {
        this.cancelScheduledParsing();
        this.timeout = setTimeout(() => this.parseAllDirty(), this.defaultTimerDelayInSeconds * 1000);
    }

    private cancelScheduledParsing(): void {
        if (this.timeout) { clearTimeout(this.timeout); }
    }

    private parseAllDirty(): void {
        // find all dirty files
        let dirtyFiles = this.getAllFilesIf(fileInfo => fileInfo.getStatus() === FileStatus.Dirty);

        dirtyFiles.forEach(file => this.reParseFile(file));
    }

    private async reParseFile(fileInfo: FileInfo): Promise<FileInfo> {
        let folderUri = PddlWorkspace.getFolderUri(fileInfo.fileUri);

        let folder = this.upsertFolder(folderUri);

        folder.remove(fileInfo);
        fileInfo = await this.parseFile(fileInfo.fileUri, fileInfo.getLanguage(), fileInfo.getVersion(), fileInfo.getText());
        folder.add(fileInfo);
        this.emit(PddlWorkspace.UPDATED, fileInfo);

        return fileInfo;
    }

    private async parseFile(fileUri: string, language: PddlLanguage, fileVersion: number, fileText: string): Promise<FileInfo> {
        if (language === PddlLanguage.PDDL) {
            let domainInfo = this.parser.tryDomain(fileUri, fileVersion, fileText);

            if (domainInfo) {
                return domainInfo;
            } else {
                let problemInfo = await this.parser.tryProblem(fileUri, fileVersion, fileText);

                if (problemInfo) {
                    return problemInfo;
                }
            }

            let unknownFile = new UnknownFileInfo(fileUri, fileVersion);
            unknownFile.setText(fileText);
            return unknownFile;
        }
        else if (language === PddlLanguage.PLAN) {
            return this.parser.parsePlan(fileUri, fileVersion, fileText, this.epsilon);
        }
        else if (language === PddlLanguage.HAPPENINGS) {
            return this.parser.parseHappenings(fileUri, fileVersion, fileText, this.epsilon);
        }
        else {
            throw Error("Unknown language: " + language);
        }
    }

    private upsertFolder(folderUri: string): Folder {
        let folder: Folder;

        if (!this.folders.has(folderUri)) {
            folder = new Folder(folderUri);
            this.folders.set(folderUri, folder);
        }
        else {
            folder = this.folders.get(folderUri);
        }

        return folder;
    }

    removeFile(documentUri: string): boolean {

        let folderUri = PddlWorkspace.getFolderUri(documentUri);

        if (this.folders.has(folderUri)) {
            let folder = this.folders.get(folderUri);
            if (folder.hasFile(documentUri)) {
                let documentInfo = folder.get(documentUri);

                this.emit(PddlWorkspace.REMOVING, documentInfo);
                return folder.remove(documentInfo);
            }
        }

        return false;
    }

    getFileInfo(fileUri: string): FileInfo {
        let folderUri = PddlWorkspace.getFolderUri(fileUri);

        if (this.folders.has(folderUri)) {
            let folder = this.folders.get(folderUri);
            let fileInfo = folder.get(fileUri);

            return fileInfo; // or null if the file did not exist in the folder
        }

        // folder does not exist
        return null;
    }

    getProblemFiles(domainInfo: DomainInfo): ProblemInfo[] {
        let folder = this.folders.get(PddlWorkspace.getFolderUri(domainInfo.fileUri));

        // find problem files in the same folder that match the domain name
        let problemFiles = folder.getProblemFilesFor(domainInfo);

        return problemFiles;
    }

    getPlanFiles(problemInfo: ProblemInfo): PlanInfo[] {
        let folder = this.folders.get(PddlWorkspace.getFolderUri(problemInfo.fileUri));

        // find plan files in the same folder that match the domain and problem names
        return Array.from(folder.files.values())
            .filter(f => f.isPlan())
            .map(f => <PlanInfo>f)
            .filter(p => lowerCaseEquals(p.problemName, problemInfo.name)
                && lowerCaseEquals(p.domainName, problemInfo.domainName));
    }

    getHappeningsFiles(problemInfo: ProblemInfo): HappeningsInfo[] {
        let folder = this.folders.get(PddlWorkspace.getFolderUri(problemInfo.fileUri));

        // find happenings files in the same folder that match the domain and problem names
        return Array.from(folder.files.values())
            .filter(f => f.isHappenings())
            .map(f => <HappeningsInfo>f)
            .filter(p => lowerCaseEquals(p.problemName, problemInfo.name)
                && lowerCaseEquals(p.domainName, problemInfo.domainName));
    }

    getAllFilesIf<T extends FileInfo>(predicate: (fileInfo: T) => boolean): T[] {
        let selectedFiles = new Array<FileInfo>();

        this.folders.forEach(folder => {
            folder.files.forEach((fileInfo) => {
                if (predicate.apply(this, [fileInfo])) { selectedFiles.push(fileInfo); }
            });
        });

        return <T[]>selectedFiles;
    }


    getAllFiles() {
        let selectedFiles = new Array<FileInfo>();

        this.folders.forEach(folder => {
            folder.files.forEach((fileInfo) => {
                selectedFiles.push(fileInfo);
            });
        });

        return selectedFiles;
    }

    /**
     * Finds a corresponding domain file
     * @param fileInfo a PDDL file info
     * @returns corresponding domain file if fileInfo is a problem file,
     * or `fileInfo` itself if the `fileInfo` is a domain file, or `null` otherwise.
     */
    asDomain(fileInfo: FileInfo): DomainInfo {
        if (fileInfo.isDomain()) {
            return <DomainInfo>fileInfo;
        }
        else if (fileInfo.isProblem()) {
            return this.getDomainFileFor(<ProblemInfo>fileInfo);
        }
        else if (fileInfo.isPlan()) {
            var problemFile1 = this.getProblemFileForPlan(<PlanInfo>fileInfo);
            if (problemFile1) {
                return this.getDomainFileFor(problemFile1);
            }
            else {
                return null;
            }
        }
        else if (fileInfo.isHappenings()) {
            var problemFile2 = this.getProblemFileForHappenings(<HappeningsInfo>fileInfo);
            return this.getDomainFileFor(problemFile2);
        }
        else {
            return null;
        }
    }

    /**
     * Finds the matching domain file in the same folder.
     * @param problemFile problem file info
     * @returns matching domain file, if exactly one exists in the same folder. `null` otherwise
     */
    getDomainFileFor(problemFile: ProblemInfo): DomainInfo {
        let folder = this.folders.get(PddlWorkspace.getFolderUri(problemFile.fileUri));

        if (!folder) { return null; }

        // find domain files in the same folder that match the problem's domain name
        let domainFiles = folder.getDomainFilesFor(problemFile);

        return domainFiles.length === 1 ? domainFiles[0] : null;
    }

    getProblemFileForPlan(planInfo: PlanInfo): ProblemInfo {
        let problemFileInfo: ProblemInfo;

        let folder = this.getFolderOf(planInfo);
        if (!folder) { return null; }
        problemFileInfo = folder.getProblemFileWithName(planInfo.problemName);

        return problemFileInfo;
    }

    getProblemFileForHappenings(happeningsInfo: HappeningsInfo): ProblemInfo {
        let problemFileInfo: ProblemInfo;

        let folder = this.getFolderOf(happeningsInfo);
        if (!folder) { return null; }
        problemFileInfo = folder.getProblemFileWithName(happeningsInfo.problemName);

        return problemFileInfo;
    }

    getFolderOf(fileInfo: FileInfo): Folder {
        return this.getFolderOfFileUri(fileInfo.fileUri);
    }

    getFolderOfFileUri(fileUri: string): Folder {
        return this.folders.get(PddlWorkspace.getFolderUri(fileUri));
    }
}