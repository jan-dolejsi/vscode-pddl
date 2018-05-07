/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, FileInfo, DomainInfo, ProblemInfo, UnknownFileInfo } from './parser'
import { Util } from './util';
import { dirname, basename } from 'path';
import { PddlExtensionContext } from './PddlExtensionContext';

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

export class PddlWorkspace {
    folders: Map<string, Folder> = new Map<string, Folder>();
    parser: Parser;

    constructor(context?: PddlExtensionContext) {
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

    upsertFile(fileUri: string, fileVersion: number, fileText: string): FileInfo {

        let folderUri = PddlWorkspace.getFolderUri(fileUri);

        let folder = this.upsertFolder(folderUri);

        folder.removeByUri(fileUri);

        let domainInfo = this.parser.tryDomain(fileUri, fileVersion, fileText);

        if (domainInfo) {
            folder.add(domainInfo);
            return domainInfo;
        } else {
            let problemInfo = this.parser.tryProblem(fileUri, fileVersion, fileText);

            if (problemInfo) {
                folder.add(problemInfo);
                return problemInfo;
            }
        }

        let unknownFile = new UnknownFileInfo(fileUri, fileVersion);
        unknownFile.text = fileText;
        folder.add(unknownFile);
        return unknownFile;
    }

    upsertFolder(folderUri: string): Folder {
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
    
    asDomain(fileInfo: FileInfo): DomainInfo{
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