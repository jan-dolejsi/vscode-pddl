/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IConnection,
    Diagnostic, DiagnosticSeverity
} from 'vscode-languageserver';

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, ProblemInfo, FileInfo, FileStatus, Parser } from '../../common/src/parser';

import { Validator } from './validator';
import { ValidatorService } from './ValidatorService';
import { ValidatorExecutable } from './ValidatorExecutable';
import { Authentication } from './Authentication';

export class Diagnostics {

    // hold the maxNumberOfProblems setting
    maxNumberOfProblems: number;
    workspace: PddlWorkspace;
    connection: IConnection;
    parserExecutableOrService: string;
    parserExecutableOptions: string;
    parserCustomPattern: string;
    timerDelayInSeconds = 3;
    timeout: NodeJS.Timer;
    validator: Validator;

    constructor(workspace: PddlWorkspace, connection: IConnection) {
        this.connection = connection;
        this.workspace = workspace;
    }

    scheduleValidation(): void {
        this.cancelScheduledValidation()
        this.timeout = setTimeout(() => { this.validateAllDirty(); }, this.timerDelayInSeconds * 1000);
    }

    cancelScheduledValidation(): void {
        if (this.timeout) clearTimeout(this.timeout);
    }

    validateAllDirty(): void {
        // find all dirty unknown files
        let dirtyUnknowns = this.workspace.getAllFilesIf(fileInfo => !fileInfo.isProblem() && !fileInfo.isDomain() && fileInfo.getStatus() == FileStatus.Dirty);

        // validate unknown files (those where the header does not parse)
        dirtyUnknowns.forEach(file => this.validateUnknownFile(file));

        // find all dirty domains
        let dirtyDomains = this.workspace.getAllFilesIf(fileInfo => fileInfo.isDomain() && fileInfo.getStatus() == FileStatus.Dirty);

        if (dirtyDomains.length > 0) {
            let firstDirtyDomain = <DomainInfo>dirtyDomains[0];
            // if there was more than one domain schedule further validation
            let scheduleFurtherValidation = dirtyDomains.length > 1;

            this.validatePddlDocument(firstDirtyDomain, scheduleFurtherValidation);
            return;
        }

        // find all dirty problems
        let dirtyProblems = this.workspace.getAllFilesIf(fileInfo => fileInfo.isProblem() && fileInfo.getStatus() == FileStatus.Dirty);

        if (dirtyProblems.length > 0) {
            let firstDirtyProblem = <ProblemInfo>dirtyProblems[0];

            // if there was more than one domain schedule further validation
            let scheduleFurtherValidation = dirtyProblems.length > 1;

            this.validatePddlDocument(firstDirtyProblem, scheduleFurtherValidation);
        }
    }

    revalidateAll(): void {
        // mark all files as dirty
        this.workspace.folders.forEach(folder => {
            folder.files.forEach(f => f.setStatus(FileStatus.Dirty));
        });
        // revalidate all files
        this.cancelScheduledValidation(); // ... and validate immediately
        this.validateAllDirty();
    }

    validatePddlDocumentByUri(fileUri: string, scheduleFurtherValidation: boolean): void {
        let fileInfo = this.workspace.getFileInfo(fileUri);
        this.validatePddlDocument(fileInfo, scheduleFurtherValidation);
    }

    validatePddlDocument(fileInfo: FileInfo, scheduleFurtherValidation: boolean): void {

        if (fileInfo == null) {
            console.log('File not found in the workspace.');
        }

        if (fileInfo.isDomain()) {
            let domainInfo = <DomainInfo>fileInfo;

            let problemFiles = this.workspace.getProblemFiles(domainInfo);

            this.validateDomainAndProblems(domainInfo, problemFiles, scheduleFurtherValidation);
        }
        else if (fileInfo.isProblem()) {
            let problemInfo = <ProblemInfo>fileInfo;

            let domainFile = this.getDomainFileFor(problemInfo);

            if (domainFile != null) {
                this.validateDomainAndProblems(domainFile, [problemInfo], scheduleFurtherValidation);
            }
        }
        else {
            // this should not happen ?!
        }
    }

    validateDomainAndProblems(domainInfo: DomainInfo, problemFiles: ProblemInfo[], scheduleFurtherValidation: boolean): void {

        if (this.parserExecutableOrService == null || this.parserExecutableOrService == "") {
            // suggest the user to update the settings
            this.connection.client.connection.sendRequest("pddl.configureParser", true).then(() => { }, () => {
                console.log("pddl.configureParser request rejected");
            });
            return;
        }

        // mark the files that they are under validation
        domainInfo.setStatus(FileStatus.Validating);
        problemFiles.forEach(p => p.setStatus(FileStatus.Validating));

        this.connection.console.log(`Validating ${domainInfo.name} and ${problemFiles.length} problem files.`)

        let validator = this.createValidator();  
        if(!validator) return;

        validator.validate(domainInfo, problemFiles, (diagnostics) => {
            // Send the computed diagnostics to VSCode.
            this.sendDiagnostics(diagnostics);            
            if (scheduleFurtherValidation) this.scheduleValidation();
        }, (err) => {
            this.connection.window.showErrorMessage(err);            
            this.connection.console.warn(err);
            this.connection.client.connection.sendRequest("pddl.configureParser", false).then(() => { }, () => {
                console.log("pddl.configureParser request rejected");
            });
        });
    }

    createValidator(): Validator{
        if(!this.validator || this.validator.path != this.parserExecutableOrService
            || (this.validator instanceof ValidatorExecutable) && (
                this.validator.syntax != this.parserExecutableOptions ||
                this.validator.customPattern != this.parserCustomPattern
            )){
            if (this.parserExecutableOrService.match(/^http[s]?:/i)) {
                // is a service
                let useAuthentication = true;
                let authentication = Authentication.create();
                return this.validator = new ValidatorService(this.parserExecutableOrService, useAuthentication, authentication);
            }
            else{
                return this.validator = new ValidatorExecutable(this.parserExecutableOrService, this.parserExecutableOptions, this.parserCustomPattern);
            }
        }
        else{
            return this.validator;
        }
    }

    sendDiagnostics(diagnostics: Map<string, Diagnostic[]>): void {
        diagnostics.forEach((diagnostics, fileUri) => this.connection.sendDiagnostics({ uri: fileUri, diagnostics }));
    }

    getDomainFileFor(problemFile: ProblemInfo): DomainInfo {
        let folder = this.workspace.folders.get(PddlWorkspace.getFolderUri(problemFile.fileUri));

        // find domain files in the same folder that match the problem's domain name
        let domainFiles = folder.getDomainFilesFor(problemFile);

        if (domainFiles.length > 1) {
            let message = `There are multiple candidate domains with name ${problemFile.domainName}: ` + domainFiles.map(d => PddlWorkspace.getFileName(d.fileUri)).join(', ');

            this.sendDiagnosticHint(problemFile.fileUri, message);
            problemFile.setStatus(FileStatus.Validated);
            return null;
        }
        else if (domainFiles.length == 0) {
            // this.workspace.folders.forEach()

            let message = `There are no domains open in the same folder with name '${problemFile.domainName}' open in the editor.`;

            this.sendDiagnosticHint(problemFile.fileUri, message);
            problemFile.setStatus(FileStatus.Validated);
            return null;
        }
        else {
            return domainFiles[0];
        }

    }

    sendDiagnosticHint(fileUri: string, message: string) {
        this.sendDiagnostic(fileUri, message, DiagnosticSeverity.Hint);
    }

    sendDiagnostic(fileUri: string, message: string, severity: DiagnosticSeverity) {
        let diagnostics: Diagnostic[] = [{
            severity: severity,
            range: Validator.createRange(0, 0),
            message: message,
            source: 'pddl'
        }];
        this.connection.sendDiagnostics({ uri: fileUri, diagnostics });
    }

    clearDiagnostics(fileUri: string): void {
        let emptyDiagnostics: Diagnostic[] = [];
        this.connection.sendDiagnostics({ uri: fileUri, diagnostics: emptyDiagnostics });
    }

    validateUnknownFile(fileInfo: FileInfo): void {
        fileInfo.setStatus(FileStatus.Validating);

        if (fileInfo.text.length > 0) {
            let firstLine = Parser.stripComments(fileInfo.text).replace(/^\s+/g, '').split('\n')[0];

            this.sendDiagnostic(fileInfo.fileUri, `Cannot recognize whether this is a domain or problem: ${firstLine}`, DiagnosticSeverity.Error);
        }
        else {
            this.clearDiagnostics(fileInfo.fileUri);
        }

        fileInfo.setStatus(FileStatus.Validated);
    }
}