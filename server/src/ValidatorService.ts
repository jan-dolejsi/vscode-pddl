/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic, Range
} from 'vscode-languageserver';

import { Validator } from './validator';
import { DomainInfo, ProblemInfo, FileStatus } from '../../common/src/parser';
import { Authentication } from '../../common/src/Authentication';

import request = require('request');

export class ValidatorService extends Validator {

    constructor(path: string, private useAuthentication: boolean, private authentication: Authentication) { 
        super(path);
    }
    
    validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void) {
        let requestHeader: any = {};
        if(this.useAuthentication) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.sToken
            }
        }

        let requestBody = {
            "domain": domainInfo.text,
            "problems": problemFiles.map(pf => pf.text)
        }

        request.post({ url: this.path, headers: requestHeader, body: requestBody, json: true }, (err, httpResponse, responseBody) => {

            if (err != null) {
                onError.apply(this, [err.message]);
                return;
            }

            if(this.useAuthentication) {
                if (httpResponse) {
                    if (httpResponse.statusCode == 400) {
                        let message = "Authentication failed. Please login or update tokens."
                        onError.apply(this, [message]);
                        return;
                    }
                    else if (httpResponse.statusCode == 401) {
                        let message = "Invalid token. Please update tokens."
                        onError.apply(this, [message]);
                        return;
                    }
                }
            }

            if (httpResponse && httpResponse.statusCode != 200) {
                let notificationMessage = `PDDL Language Validator Server returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                //let notificationType = MessageType.Warning;
                onError.apply(this, [notificationMessage]);
                return;
            }

            let messages = responseBody;

            let diagnostics = this.createEmptyDiagnostics(domainInfo, problemFiles);

            for (var i = 0; i < messages.length; i++) {
                //&& diagnostics.length < this.maxNumberOfProblems; i++) {

                domainInfo.setStatus(FileStatus.Validated);
                problemFiles.forEach(p => p.setStatus(FileStatus.Validated));

                let location: string = messages[i].location;

                let fileUri: string = null;
                if (location == "DOMAIN") {
                    fileUri = domainInfo.fileUri;
                }
                else if (location.startsWith("PROBLEM")) {
                    var problemIdx = parseInt(location.substr("PROBLEM".length + 1));
                    fileUri = problemFiles[problemIdx].fileUri;
                }
                else {
                    console.log("Unsupported: " + location);
                    continue;
                }

                let severity = Validator.toSeverity(messages[i].severity);

                let range = this.toRange(messages[i].position);

                diagnostics.get(fileUri).push({
                    severity: severity,
                    range: range,
                    message: messages[i].message,
                    source: this.PDDL
                });
            }

            // Send the computed diagnostics to VSCode.
            onSuccess.apply(this, [diagnostics]);
        });
    }
    
    toRange(position: any): Range {
        if (position == null) return Validator.createRange(0, 0);

        let line = parseInt(position.line) - 1;
        let character = parseInt(position.character) - 1;

        return Validator.createRange(line, character);
    }

}
