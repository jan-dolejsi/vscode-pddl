/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { URL } from 'url';
import {
    Diagnostic, Range, Uri
} from 'vscode';

import { Validator } from './validator';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { FileStatus } from 'pddl-workspace';
import { SAuthentication } from '../util/Authentication';
import { HttpStatusError, postJson } from '../httpUtils';

export class ValidatorService extends Validator {

    constructor(path: string, private useAuthentication: boolean, private authentication: SAuthentication) {
        super(path);
    }

    async validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let requestHeader: any = {};
        if (this.useAuthentication && this.authentication.getToken()) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.getToken()
            };
        }

        const requestBody = {
            "domain": domainInfo.getText(),
            "problems": problemFiles.map(pf => pf.getText())
        };

        let messages: ValParsingProblem[] = [];
        try {
            messages = await postJson<ValParsingProblem[]>(new URL(this.path), requestBody, requestHeader);
        } catch (err: unknown) {
            if (!(err instanceof HttpStatusError)) {
                const message = (err as Error).message;
                onError.apply(this, [message]);
                return;
            }
            let message: string;
            if (this.useAuthentication && err instanceof HttpStatusError) {
                switch (err.statusCode) {
                    case 400:
                        message = "Authentication failed. Please login or update tokens.";
                        break;
                    case 401:
                        message = "Invalid token. Please update tokens.";
                        break;
                    default:
                        message = `PDDL Language Parser returned code ${err.statusCode} ${err.statusMessage}`;
                }
                onError.apply(this, [message]);
                return;
            }
        }

        const diagnostics = this.createEmptyDiagnostics(domainInfo, problemFiles);

        for (let i = 0; i < messages.length; i++) {
            //&& diagnostics.length < this.maxNumberOfProblems; i++) {

            domainInfo.setStatus(FileStatus.Validated);
            problemFiles.forEach(p => p.setStatus(FileStatus.Validated));

            const location: string = messages[i].location;

            let fileUri: Uri | undefined;
            if (location === "DOMAIN") {
                fileUri = domainInfo.fileUri;
            }
            else if (location.startsWith("PROBLEM")) {
                const problemIdx = parseInt(location.substring("PROBLEM".length + 1));
                fileUri = problemFiles[problemIdx].fileUri;
            }
            else {
                console.log("Unsupported: " + location);
                continue;
            }


            if (fileUri !== undefined) {
                const diagnostic = toDiagnostic(messages[i]);
                diagnostics.get(fileUri.toString())?.push(diagnostic);
            }
        }

        // Send the computed diagnostics to VSCode.
        onSuccess.apply(this, [diagnostics]);
    }

    static toRange(position: ValPosition): Range {
        if (position === null || position === undefined) { return Validator.createRange(0, 0); }

        const line = position.line - 1;
        const character = position.character - 1;

        return Validator.createRange(line, character);
    }

}

export interface ValParsingProblem {
    /** DOMAIN / PROBLEM*/
    location: string;
    message: string;
    position: ValPosition;
    severity: string;
}

interface ValPosition {
    line: number;
    character: number;
}

export function toDiagnostic(problem: ValParsingProblem) {
    const severity = Validator.toSeverity(problem.severity);
    const range = ValidatorService.toRange(problem.position);
    return new Diagnostic(range, problem.message, severity);
}
