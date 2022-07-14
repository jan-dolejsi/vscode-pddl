/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic, Range, Uri
} from 'vscode';

import { Validator } from './validator';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { FileStatus } from 'pddl-workspace';
import { SAuthentication } from '../util/Authentication';

import request = require('request');

export class ValidatorService extends Validator {

    constructor(path: string, private useAuthentication: boolean, private authentication: SAuthentication) {
        super(path);
    }

    validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void {
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

        request.post({ url: this.path, headers: requestHeader, body: requestBody, json: true }, (err, httpResponse, responseBody) => {

            if (err) {
                onError.apply(this, [err.message]);
                return;
            }

            if (this.useAuthentication) {
                if (httpResponse) {
                    if (httpResponse.statusCode === 400) {
                        const message = "Authentication failed. Please login or update tokens.";
                        onError.apply(this, [message]);
                        return;
                    }
                    else if (httpResponse.statusCode === 401) {
                        const message = "Invalid token. Please update tokens.";
                        onError.apply(this, [message]);
                        return;
                    }
                }
            }

            if (httpResponse && httpResponse.statusCode !== 200) {
                const notificationMessage = `PDDL Language Parser returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                //let notificationType = MessageType.Warning;
                onError.apply(this, [notificationMessage]);
                return;
            }

            const messages: ValParsingProblem[] = responseBody;

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
        });
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
