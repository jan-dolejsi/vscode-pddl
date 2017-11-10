/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic
} from 'vscode-languageserver';

import * as process from 'child_process';
import * as tmp from 'tmp';
import fs = require('fs');

import { Validator } from './validator';
import { ProblemPattern } from './ProblemPattern';
import { DomainInfo, ProblemInfo } from '../../common/src/parser';
import { PddlFactory } from '../../common/src/PddlFactory';

export class ValidatorExecutable extends Validator {
    constructor(path: string, public syntax: string, public customPattern: string) { super(path); }

    validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void {
        let domainFilePath = ValidatorExecutable.toFile("domain", domainInfo.text);

        let diagnostics = this.createEmptyDiagnostics(domainInfo, problemFiles);

        if (!problemFiles.length) {
            let problemFilePath = ValidatorExecutable.toFile("problem", PddlFactory.createEmptyProblem('dummy', domainInfo.name));
            let pathToUriMap: [string, string][] = [[domainFilePath, domainInfo.fileUri]];

            this.validateOneProblem(domainFilePath, problemFilePath, output => {
                this.processOutput(pathToUriMap, output, diagnostics);
                onSuccess.apply(this, [diagnostics]);
            }, onError);
        }
        else {
            problemFiles.forEach(problemFile => {
                let problemFilePath = ValidatorExecutable.toFile("problem", problemFile.text);
                let pathToUriMap: [string, string][] = [[domainFilePath, domainInfo.fileUri], [problemFilePath, problemFile.fileUri]];

                // todo: the issues in the domain file should only be output once, not as many times as there are problem files
                this.validateOneProblem(domainFilePath, problemFilePath, output => {
                    this.processOutput(pathToUriMap, output, diagnostics);
                    onSuccess.apply(this, [diagnostics]);
                }, onError);
            });
        }
    }

    private processOutput(pathToUriMap: [string, string][], output: string, diagnostics: Map<string, Diagnostic[]>) {
        let filePaths = pathToUriMap.map(tuple => tuple[0]);

        let patterns = [
            // popf pattern
            new ProblemPattern(`/^($(filePaths))\\s*:\\s*line\\s*:\\s*(\\d*)\\s*:\\s*(Error|Warning)\\s*:\\s*(.*)$/gmi/1,3,2,0,4`, filePaths),
            // pddl4j pattern
            new ProblemPattern(`/(error|warning) at line (\\d+), column (\\d+), file \\(($(filePaths))\\)\\s*:\\s*(.+)/ig/4,1,2,3,5`, filePaths),
        ];

        if(this.customPattern){
            patterns.push(new ProblemPattern(this.customPattern, filePaths));
        }

        patterns.forEach(pattern => {
            let match: RegExpExecArray;
            while (match = pattern.regEx.exec(output)) {

                let pathUriTuple = pathToUriMap.find(tuple => tuple[0] == pattern.getFilePath(match))

                if (!pathUriTuple) continue; // this is not a file of interest

                let uri = pathUriTuple[1];
                diagnostics.get(uri).push({
                    severity: Validator.toSeverity(pattern.getSeverity(match)),
                    message: pattern.getMessage(match),
                    range: pattern.getRange(match),
                    source: this.PDDL
                });
            }
        });

    }

    private validateOneProblem(domainFilePath: string, problemFilePath: string, onOutput: (output: string) => void, onError: (error: string) => void): void {
        let command = this.syntax.replace('$(parser)', this.path)
            .replace('$(domain)', ValidatorExecutable.q(domainFilePath))
            .replace('$(problem)', ValidatorExecutable.q(problemFilePath));

        this.runProcess(command, onOutput, onError);
    }

    private runProcess(command: string, onOutput: (output: string) => void, onError: (error: string) => void): void {

        let child = process.exec(command, (error, stdout, stderr) => {
            if (error && !child.killed) {
                onError.apply(this, [error.message]);
                console.log(stderr)
            }

            onOutput.apply(this, [stdout]);
        });
    }

    static q(path: string): string {
        return path.includes(' ') ? `"${path}"` : path;
    }

    static toFile(prefix: string, text: string): string {
        var tempFile = tmp.fileSync({ mode: 0o644, prefix: prefix + '-', postfix: '.pddl' });
        fs.writeSync(tempFile.fd, text, 0, 'utf8');
        return tempFile.name;
    }
}