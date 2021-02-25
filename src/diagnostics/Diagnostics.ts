/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic, DiagnosticSeverity, DiagnosticCollection, Uri, window, Disposable, workspace
} from 'vscode';

import { Authentication } from '../util/Authentication';
import { PddlWorkspace } from 'pddl-workspace';
import { PlanInfo } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { FileInfo, FileStatus, stripComments } from 'pddl-workspace';

import { Validator } from './validator';
import { ValidatorService } from './ValidatorService';
import { ValidatorExecutable } from './ValidatorExecutable';
import { PDDLParserSettings } from '../util/Settings';
import { PddlConfiguration, PDDL_PARSER, VALIDATION_PATH, CONF_PDDL } from '../configuration/configuration';
import { PlanValidator } from './PlanValidator';
import { HappeningsValidator } from './HappeningsValidator';
import { HappeningsInfo } from 'pddl-workspace';
import { NoDomainAssociated, getDomainFileForProblem } from '../workspace/workspaceUtils';
import { isHttp, toUri } from '../utils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { toDiagnosticsFromParsingProblems } from './validatorUtils';

/**
 * Listens to updates to PDDL files and performs detailed parsing and syntactical analysis and report problems as `Diagnostics`.
 */
export class Diagnostics extends Disposable {

    timeout: NodeJS.Timer | undefined;
    validator: Validator | undefined;
    pddlParserSettings: PDDLParserSettings;

    private defaultTimerDelayInSeconds = 3;

    constructor(private readonly codePddlWorkspace: CodePddlWorkspace, private readonly diagnosticCollection: DiagnosticCollection, 
        private readonly pddlConfiguration: PddlConfiguration,
        private readonly planValidator: PlanValidator, private readonly happeningsValidator: HappeningsValidator) {
        super(() => { console.log('Diagnostics disposed'); });//this.codePddlWorkspace.pddlWorkspace.removeAllListeners()); // this was probably too harsh
        this.pddlParserSettings = pddlConfiguration.getParserSettings();

        this.codePddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
            // clear diagnostics for that file
            this.clearDiagnostics(fileInfo.fileUri);
            this.scheduleValidation();
        });
        this.codePddlWorkspace.pddlWorkspace.on(PddlWorkspace.REMOVING, (doc: FileInfo) => this.clearDiagnostics(doc.fileUri));

        workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(PDDL_PARSER)
                || e.affectsConfiguration(CONF_PDDL + '.' + VALIDATION_PATH)) {
                this.handleConfigurationChange();
            }
        });
    }

    scheduleValidation(): void {
        this.cancelScheduledValidation();
        const timerDelayInSeconds = this.pddlParserSettings.delayInSecondsBeforeParsing || this.defaultTimerDelayInSeconds;
        this.timeout = setTimeout(() => this.validateAllDirty(), timerDelayInSeconds * 1000);
    }

    cancelScheduledValidation(): void {
        if (this.timeout) { clearTimeout(this.timeout); }
    }

    validateAllDirty(): void {
        // find all dirty unknown files
        const dirtyUnknowns = this.codePddlWorkspace.pddlWorkspace.getAllFilesIf(fileInfo => fileInfo.isUnknownPddl() && fileInfo.getStatus() === FileStatus.Parsed);

        // validate unknown files (those where the header does not parse)
        dirtyUnknowns.forEach(file => this.validateUnknownFile(file));

        // find all dirty domains
        const dirtyDomains = this.codePddlWorkspace.pddlWorkspace.getAllFilesIf(fileInfo => fileInfo.isDomain() && fileInfo.getStatus() === FileStatus.Parsed);

        if (dirtyDomains.length > 0) {
            const firstDirtyDomain = dirtyDomains[0] as DomainInfo;
            // if there was more than one domain schedule further validation
            const scheduleFurtherValidation = dirtyDomains.length > 1;

            this.validatePddlDocument(firstDirtyDomain, scheduleFurtherValidation);
        }

        // find all dirty problems
        const dirtyProblems = this.codePddlWorkspace.pddlWorkspace.getAllFilesIf(fileInfo => fileInfo.isProblem() && fileInfo.getStatus() === FileStatus.Parsed);

        if (dirtyProblems.length > 0) {
            const firstDirtyProblem = dirtyProblems[0] as ProblemInfo;

            // if there was more than one domain schedule further validation
            const scheduleFurtherValidation = dirtyProblems.length > 1;

            this.validatePddlDocument(firstDirtyProblem, scheduleFurtherValidation);
        }

        // find all dirty plans
        const dirtyPlans = this.codePddlWorkspace.pddlWorkspace.getAllFilesIf(fileInfo => fileInfo.isPlan() && fileInfo.getStatus() === FileStatus.Parsed);

        if (dirtyPlans.length > 0) {
            const firstDirtyPlan = dirtyPlans[0] as PlanInfo;

            // if there was more than one dirty file, schedule further validation
            const scheduleFurtherValidation = dirtyPlans.length > 1;

            this.validatePlan(firstDirtyPlan, scheduleFurtherValidation);
        }

        // find all dirty happenings
        const dirtyHappenings = this.codePddlWorkspace.pddlWorkspace.getAllFilesIf(fileInfo => fileInfo.isHappenings() && fileInfo.getStatus() === FileStatus.Parsed);

        if (dirtyHappenings.length > 0) {
            const firstDirtyHappenings = dirtyHappenings[0] as HappeningsInfo;

            // if there was more than one dirty file, schedule further validation
            const scheduleFurtherValidation = dirtyHappenings.length > 1;

            this.validateHappenings(firstDirtyHappenings, scheduleFurtherValidation);
        }
    }

    handleConfigurationChange(): void {
        this.pddlParserSettings = this.pddlConfiguration.getParserSettings();
        this.revalidateAll();
    }

    revalidateAll(): void {
        // mark all files as dirty
        this.codePddlWorkspace.pddlWorkspace.folders.forEach(folder => {
            folder.files
                .forEach(f => {
                    if (f.getStatus() !== FileStatus.Dirty) { f.setStatus(FileStatus.Parsed); }
                }
                );
        });
        // revalidate all files
        this.cancelScheduledValidation(); // ... and validate immediately
        this.validateAllDirty();
    }

    validatePddlDocumentByUri(fileUri: Uri, scheduleFurtherValidation: boolean): void {
        const fileInfo = this.codePddlWorkspace.pddlWorkspace.getFileInfo(fileUri);
        if (!fileInfo) { throw new Error(`File not found in the PDDL workspace: ${fileUri}`); }
        this.validatePddlDocument(fileInfo, scheduleFurtherValidation);
    }

    validatePlan(planInfo: PlanInfo, scheduleFurtherValidation: boolean): void {
        if (planInfo === null || planInfo === undefined) { return; }

        if (!this.planValidator.testConfiguration()) { return; }

        // mark the file as under validation
        planInfo.setStatus(FileStatus.Validating);

        console.log(`Validating ${planInfo.name} plan.`);

        this.planValidator.validatePlanAndReportDiagnostics(planInfo, false, (diagnostics) => {
            // Send the computed diagnostics to VSCode.
            this.sendDiagnostics(diagnostics);
            planInfo.setStatus(FileStatus.Validated);
            if (scheduleFurtherValidation) { this.scheduleValidation(); }
        }, (err) => {
            window.showErrorMessage("Error during plan validation: " + err);
            console.warn("Error during plan validation: " + err);
            // var showNever = false;
            // this.pddlConfiguration.suggestNewValidatorConfiguration(showNever);
        });
    }

    validateHappenings(happeningsInfo: HappeningsInfo, scheduleFurtherValidation: boolean): void {
        if (happeningsInfo === null || happeningsInfo === undefined) { return; }

        // mark the file as under validation
        happeningsInfo.setStatus(FileStatus.Validating);

        console.log(`Validating ${happeningsInfo.name} plan.`);

        this.happeningsValidator.validateAndReportDiagnostics(happeningsInfo, false, (diagnostics) => {
            // Send the computed diagnostics to VSCode.
            this.sendDiagnostics(diagnostics);
            happeningsInfo.setStatus(FileStatus.Validated);
            if (scheduleFurtherValidation) { this.scheduleValidation(); }
        }, (err) => {
            window.showErrorMessage(err);
            console.warn(err);
        });
    }

    validatePddlDocument(fileInfo: FileInfo, scheduleFurtherValidation: boolean): void {

        if (fileInfo === null || fileInfo === undefined) {
            console.log('File not found in the workspace.');
            return;
        }

        // console.log(`Validating '${fileInfo.fileUri}' file.`);

        // detect parsing and pre-processing issues
        if (fileInfo.getParsingProblems().length > 0) {
            const parsingProblems = new Map<string, Diagnostic[]>();
            parsingProblems.set(fileInfo.fileUri.toString(), toDiagnosticsFromParsingProblems(fileInfo.getParsingProblems()));
            this.sendDiagnostics(parsingProblems);
            return;
        }

        if (fileInfo.isDomain()) {
            const domainInfo = fileInfo as DomainInfo;

            const problemFiles = this.codePddlWorkspace.pddlWorkspace.getProblemFiles(domainInfo);

            this.validateDomainAndProblems(domainInfo, problemFiles, scheduleFurtherValidation);
        }
        else if (fileInfo.isProblem()) {
            const problemInfo = fileInfo as ProblemInfo;

            const domainFile = this.getDomainFileFor(problemInfo);

            if (domainFile) {
                this.validateDomainAndProblems(domainFile, [problemInfo], scheduleFurtherValidation);
            }
        }
        else {
            // this should not happen ?!
        }
    }

    validateDomainAndProblems(domainInfo: DomainInfo, problemFiles: ProblemInfo[], scheduleFurtherValidation: boolean): void {

        if (!this.pddlConfiguration.getParserPath()) {
            // suggest the user to update the settings
            const showNever = true;
            this.pddlConfiguration.suggestNewParserConfiguration(showNever);
            return;
        }

        // mark the files that they are under validation
        domainInfo.setStatus(FileStatus.Validating);
        problemFiles.forEach(p => p.setStatus(FileStatus.Validating));

        const validator = this.createValidator(this.pddlConfiguration.getParserPath()!);
        if (!validator) { return; }

        validator.validate(domainInfo, problemFiles, (diagnostics) => {
            // Send the computed diagnostics to VSCode.
            this.sendDiagnostics(diagnostics);
            if (scheduleFurtherValidation) { this.scheduleValidation(); }
        }, (err) => {
            window.showErrorMessage(err);
            console.warn(err);
            const showNever = false;
            this.pddlConfiguration.suggestNewParserConfiguration(showNever);
        });
    }

    createValidator(newParserPath: string): Validator {

        if (!this.validator || this.validator.path !== newParserPath
            || (this.validator instanceof ValidatorExecutable) && (
                this.validator.syntax !== this.pddlParserSettings.executableOptions ||
                this.validator.customPattern !== this.pddlParserSettings.problemPattern
            )) {
            
            if (isHttp(newParserPath)) {
                // is a service
                const authentication = new Authentication(
                    this.pddlParserSettings.serviceAuthenticationUrl,
                    this.pddlParserSettings.serviceAuthenticationRequestEncoded,
                    this.pddlParserSettings.serviceAuthenticationClientId,
                    this.pddlParserSettings.serviceAuthenticationCallbackPort,
                    this.pddlParserSettings.serviceAuthenticationTimeoutInMs,
                    this.pddlParserSettings.serviceAuthenticationTokensvcUrl,
                    this.pddlParserSettings.serviceAuthenticationTokensvcApiKey,
                    this.pddlParserSettings.serviceAuthenticationTokensvcAccessPath,
                    this.pddlParserSettings.serviceAuthenticationTokensvcValidatePath,
                    this.pddlParserSettings.serviceAuthenticationTokensvcCodePath,
                    this.pddlParserSettings.serviceAuthenticationTokensvcRefreshPath,
                    this.pddlParserSettings.serviceAuthenticationTokensvcSvctkPath,
                    this.pddlParserSettings.serviceAuthenticationRefreshToken,
                    this.pddlParserSettings.serviceAuthenticationAccessToken,
                    this.pddlParserSettings.serviceAuthenticationSToken);
                return this.validator = new ValidatorService(newParserPath, this.pddlParserSettings.serviceAuthenticationEnabled, authentication);
            }
            else {
                return this.validator = new ValidatorExecutable(newParserPath, this.pddlParserSettings.executableOptions, this.pddlParserSettings.problemPattern);
            }
        }
        else {
            return this.validator;
        }
    }

    sendDiagnostics(diagnostics: Map<string, Diagnostic[]>): void {
        diagnostics.forEach((diagnostics, fileUri) => this.diagnosticCollection.set(Uri.parse(fileUri), diagnostics));
    }

    getDomainFileFor(problemFile: ProblemInfo): DomainInfo | undefined {
        try {
            return getDomainFileForProblem(problemFile, this.codePddlWorkspace);
        }
        catch (err) {
            if (err instanceof NoDomainAssociated) {
                this.sendDiagnosticInfo(toUri(problemFile.fileUri), err.message, NoDomainAssociated.DIAGNOSTIC_CODE);
                problemFile.setStatus(FileStatus.Validated);
                return undefined;
            }
            throw err;
        }
    }

    sendDiagnosticInfo(fileUri: Uri, message: string, code?: string | number): void {
        this.sendDiagnostic(fileUri, message, DiagnosticSeverity.Information, code);
    }

    sendDiagnostic(fileUri: Uri, message: string, severity: DiagnosticSeverity, code?: string | number): void {
        const diagnostic = new Diagnostic(Validator.createLineRange(0), message, severity);
        if (code !== undefined && code !== null) {
            diagnostic.code = code;
        }
        this.diagnosticCollection.set(fileUri, [diagnostic]);
    }

    clearDiagnostics(fileUri: Uri): void {
        this.diagnosticCollection.delete(fileUri);
    }

    validateUnknownFile(fileInfo: FileInfo): void {
        fileInfo.setStatus(FileStatus.Validating);

        const firstLine = stripComments(fileInfo.getText()).replace(/^\s+/g, '').split('\n')[0];

        this.sendDiagnostic(fileInfo.fileUri, `Cannot recognize whether this is a domain or problem: ${firstLine}`, DiagnosticSeverity.Error, 'CONTENT_NOT_RECOGNIZED');

        fileInfo.setStatus(FileStatus.Validated);
    }
}
