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
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { PddlFactory } from '../../../common/src/PddlFactory';
import { utils } from 'pddl-workspace';

export class ValidatorExecutable extends Validator {
    constructor(path: string, public syntax: string, public customPattern: string) { super(path); }

    validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void {
        let domainFilePath = utils.Util.toPddlFileSync("domain", domainInfo.getText());

        let diagnostics = this.createEmptyDiagnostics(domainInfo, problemFiles);

        if (!problemFiles.length) {
            let problemFilePath = utils.Util.toPddlFileSync("problem", PddlFactory.createEmptyProblem('dummy', domainInfo.name));
            let pathToUriMap: [string, string][] = [[domainFilePath, domainInfo.fileUri]];

            this.validateOneProblem(domainFilePath, problemFilePath, output => {
                this.processOutput(pathToUriMap, output, diagnostics);
                onSuccess.apply(this, [diagnostics]);
            }, onError);
        }
        else {
            problemFiles.forEach(problemFile => {
                let problemFilePath = utils.Util.toPddlFileSync("problem", problemFile.getText());
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
            let match: RegExpExecArray | null;
            while (match = pattern.regEx.exec(output)) {
                // only report each warning/error once
                if (distinctOutputs.includes(match[0])) { continue; }
                distinctOutputs.push(match[0]);
                
                let pathUriTuple = pathToUriMap.find(tuple => tuple[0] === pattern.getFilePath(match!));

                if (!pathUriTuple) { continue; } // this is not a file of interest

                let uri = pathUriTuple[1];
                let diagnostic = new Diagnostic(pattern.getRange(match), pattern.getMessage(match), Validator.toSeverity(pattern.getSeverity(match)));
                diagnostics.get(uri)?.push(diagnostic);
            }
        });

    }

    private validateOneProblem(domainFilePath: string, problemFilePath: string, onOutput: (output: string) => void, onError: (error: string) => void): void {
        let syntaxFragments = this.syntax.split(' ');
        if (syntaxFragments.length < 1) {
            throw new Error('Parser syntax pattern should start with $(parser)');
        }

        let args = syntaxFragments
            .slice(1)
            .map(fragment => {
                switch (fragment) {
                    case '$(parser)': return utils.Util.q(this.path);
                    case '$(domain)': return utils.Util.q(domainFilePath);
                    case '$(problem)': return utils.Util.q(problemFilePath);
                    default: return fragment;
                }
            });

        this.runProcess(utils.Util.q(this.path), args, onOutput, onError);
    }

    private runProcess(parserPath: string, args: string[], onOutput: (output: string) => void, onError: (error: string) => void): void {
        let child = process.spawn(parserPath, args);
    
        var trailingLine = '';

        child.stdout.on('data', output => {
            let outputString = trailingLine + output.toString("utf8");
            onOutput.apply(this, [outputString]);
            trailingLine = outputString.substr(outputString.lastIndexOf('\n'));
        });

        child.on("error", error => {
            if (!child.killed) {
                onError.apply(this, [error.message]);
                console.log(error.message);
            }
        });

        child.on("close", (code, signal) => {
            if (code !== 0) {
                console.log(`Parser exit code: ${code}, signal: ${signal}.`);
            }
        });
    }
}