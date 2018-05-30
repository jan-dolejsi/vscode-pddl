/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, FileInfo, DomainInfo, ProblemInfo, UnknownFileInfo, FileStatus } from './parser'
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

    getProblemFilesFor(domainInfo: DomainInfo): ProblemInfo[] {
        let problemFiles: ProblemInfo[] = [];

        this.files.forEach(value => {
            if (value.isProblem()) {
                let problemInfo = <ProblemInfo>value;

                if (problemInfo.domainName == domainInfo.name) {
                    problemFiles.push(problemInfo);
                }
            }
        })

        return problemFiles;
    }

    getDomainFilesFor(problemInfo: ProblemInfo): DomainInfo[] {
        let domainFiles: DomainInfo[] = [];

        this.files.forEach(value => {
            if (value.isDomain()) {
                let domainInfo = <DomainInfo>value;

                if (domainInfo.name == problemInfo.domainName) {
                    domainFiles.push(domainInfo);
                }
            }
        })

        return domainFiles;
    }
}

export class PddlWorkspace extends EventEmitter {
    folders: Map<string, Folder> = new Map<string, Folder>();
    parser: Parser;
    timeout: NodeJS.Timer;
    defaultTimerDelayInSeconds = 1;

    public static INSERTED = Symbol("INSERTED");
    public static UPDATED = Symbol("UPDATED");
    public static REMOVING = Symbol("REMOVING");

    constructor(context?: PddlExtensionContext) {
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

    upsertAndParseFile(fileUri: string, fileVersion: number, fileText: string): FileInfo {
        let fileInfo = this.upsertFile(fileUri, fileVersion, fileText);
        if (fileInfo.getStatus() == FileStatus.Dirty) {
            fileInfo = this.reParseFile(fileInfo);
        }

        return fileInfo;
    }

    upsertFile(fileUri: string, fileVersion: number, fileText: string): FileInfo {

        let folderUri = PddlWorkspace.getFolderUri(fileUri);

        let folder = this.upsertFolder(folderUri);

        let fileInfo: FileInfo = folder.get(fileUri);
        if (fileInfo) {
            if (fileInfo.update(fileVersion, fileText)) {
                this.scheduleParsing();
            }
        }
        else {
            fileInfo = this.insertFile(folder, fileUri, fileVersion, fileText);
        }

        return fileInfo;
    }

    private insertFile(folder: Folder, fileUri: string, fileVersion: number, fileText: string): FileInfo {
        let fileInfo = this.parseFile(fileUri, fileVersion, fileText);
        folder.add(fileInfo);
        this.emit(PddlWorkspace.UPDATED, fileInfo);
        this.emit(PddlWorkspace.INSERTED, fileInfo);
        return fileInfo;
    }

    scheduleParsing(): void {
        this.cancelScheduledParsing()
        this.timeout = setTimeout(() => this.parseAllDirty(), this.defaultTimerDelayInSeconds * 1000);
    }

    private cancelScheduledParsing(): void {
        if (this.timeout) clearTimeout(this.timeout);
    }

    private parseAllDirty(): void {
        // find all dirty files
        let dirtyFiles = this.getAllFilesIf(fileInfo => fileInfo.getStatus() == FileStatus.Dirty);

        dirtyFiles.forEach(file => this.reParseFile(file));
    }

    private reParseFile(fileInfo: FileInfo): FileInfo {
        let folderUri = PddlWorkspace.getFolderUri(fileInfo.fileUri);

        let folder = this.upsertFolder(folderUri);

        folder.remove(fileInfo);
        fileInfo = this.parseFile(fileInfo.fileUri, fileInfo.version, fileInfo.text);
        folder.add(fileInfo);
        this.emit(PddlWorkspace.UPDATED, fileInfo);

        return fileInfo;
    }

    private parseFile(fileUri: string, fileVersion: number, fileText: string): FileInfo {
        let domainInfo = this.parser.tryDomain(fileUri, fileVersion, fileText);

        if (domainInfo) {
            return domainInfo;
        } else {
            let problemInfo = this.parser.tryProblem(fileUri, fileVersion, fileText);

            if (problemInfo) {
                return problemInfo;
            }
        }

        let unknownFile = new UnknownFileInfo(fileUri, fileVersion);
        unknownFile.text = fileText;
        return unknownFile;
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

    getAllFilesIf<T extends FileInfo>(predicate: (fileInfo: T) => boolean) {
        let selectedFiles = new Array<FileInfo>();

        this.folders.forEach(folder => {
            folder.files.forEach((fileInfo) => {
                if (predicate.apply(this, [fileInfo])) selectedFiles.push(fileInfo);
            });
        });

        return selectedFiles;
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

    asDomain(fileInfo: FileInfo): DomainInfo {
        if (fileInfo.isDomain()) {
            return <DomainInfo>fileInfo;
        }
        else if (fileInfo.isProblem()) {
            return this.getDomainFileFor(<ProblemInfo>fileInfo);
        }
        else return null;
    }

    getDomainFileFor(problemFile: ProblemInfo): DomainInfo {
        let folder = this.folders.get(PddlWorkspace.getFolderUri(problemFile.fileUri));

        // find domain files in the same folder that match the problem's domain name
        let domainFiles = folder.getDomainFilesFor(problemFile);

        return domainFiles.length == 1 ? domainFiles[0] : null;
    }

    getFolderOf(fileInfo: FileInfo): Folder {
        return this.folders.get(PddlWorkspace.getFolderUri(fileInfo.fileUri));
    }
}