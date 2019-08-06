/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic
} from 'vscode';

import * as process from 'child_process';

import { Validator } from './validator';
import { ProblemPattern } from './ProblemPattern';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { PddlFactory } from '../../../common/src/PddlFactory';
import { Util } from '../../../common/src/util';

export class ValidatorExecutable extends Validator {
    constructor(path: string, public syntax: string, public customPattern: string) { super(path); }

    validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void {
        let domainFilePath = Util.toPddlFileSync("domain", domainInfo.getText());

        let diagnostics = this.createEmptyDiagnostics(domainInfo, problemFiles);

        if (!problemFiles.length) {
            let problemFilePath = Util.toPddlFileSync("problem", PddlFactory.createEmptyProblem('dummy', domainInfo.name));
            let pathToUriMap: [string, string][] = [[domainFilePath, domainInfo.fileUri]];

            this.validateOneProblem(domainFilePath, problemFilePath, output => {
                this.processOutput(pathToUriMap, output, diagnostics);
                onSuccess.apply(this, [diagnostics]);
            }, onError);
        }
        else {
            problemFiles.forEach(problemFile => {
                let problemFilePath = Util.toPddlFileSync("problem", problemFile.getText());
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

        let distinctOutputs: string[] = [];

        patterns.forEach(pattern => {
            let match: RegExpExecArray;
            while (match = pattern.regEx.exec(output)) {
                // only report each warning/error once
                if (distinctOutputs.includes(match[0])) { continue; }
                distinctOutputs.push(match[0]);
                
                let pathUriTuple = pathToUriMap.find(tuple => tuple[0] === pattern.getFilePath(match));

                if (!pathUriTuple) { continue; } // this is not a file of interest

                let uri = pathUriTuple[1];
                let diagnostic = new Diagnostic(pattern.getRange(match), pattern.getMessage(match),Validator.toSeverity(pattern.getSeverity(match)));
                diagnostics.get(uri).push(diagnostic);
            }
        });

    }

    private validateOneProblem(domainFilePath: string, problemFilePath: string, onOutput: (output: string) => void, onError: (error: string) => void): void {
        let command = this.syntax.replace('$(parser)', Util.q(this.path))
            .replace('$(domain)', Util.q(domainFilePath))
            .replace('$(problem)', Util.q(problemFilePath));

        this.runProcess(command, onOutput, onError);
    }

    private runProcess(command: string, onOutput: (output: string) => void, onError: (error: string) => void): void {

        let child = process.exec(command, (error, stdout, stderr) => {
            if (error && !child.killed) {
                onError.apply(this, [error.message]);
                console.log(stderr);
            }

            onOutput.apply(this, [stdout]);
        });
    }
}