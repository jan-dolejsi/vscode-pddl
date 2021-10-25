/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic
} from 'vscode';

import { Validator } from './validator';
import { ParserOptions, ParserRunContext, ProblemPattern } from 'ai-planning-val';
import { ProblemInfo, DomainInfo } from 'pddl-workspace';
import { Parser } from 'ai-planning-val';
import { toDiagnostics } from './validatorUtils';

export class ValidatorExecutable extends Validator {
    
    private parser: ConfiguredParser;
    
    constructor(path: string, public readonly syntax: string, public readonly customPattern: string) {
        super(path);
        this.parser = new ConfiguredParser({ executablePath: this.path, customPattern, syntax }, );
    }

    async validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[],
        onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void,
        onError: (error: string) => void): Promise<void> {

        if (!problemFiles.length) {
            try {
                const parsingErrors = await this.parser.validate(domainInfo);
                onSuccess.apply(this, [toDiagnostics(parsingErrors, [domainInfo])]);
            } catch (err: unknown) {
                onError.apply(this, ["" + err]);
            }
        }
        else {
            problemFiles.forEach(async problemFile => {

                // todo: the issues in the domain file should only be output once, not as many times as there are problem files
                try {
                    const parsingErrors = await this.parser.validate(domainInfo, problemFile);
                    onSuccess.apply(this, [toDiagnostics(parsingErrors, [domainInfo, problemFile])]);
                } catch (err: unknown) {
                    onError.apply(this, ["" + err]);
                }
            });
        }
    }
}

class ConfiguredParser extends Parser {
    customPattern: string;
    args: string[];
    constructor(options: ConfiguredParserOptions) {
        super(options);
        this.customPattern = options.customPattern;
        this.args = options.syntax.split(' ');
    }

    protected getSyntax(): string[] {
        return this.args;
    }

    protected createPatternMatchers(context: ParserRunContext): ProblemPattern[] {
        const filePaths = context.fileNameMap.getFilePaths();

        const patterns = [
            // popf pattern
            new ProblemPattern(`/^($(filePaths))\\s*:\\s*line\\s*:\\s*(\\d*)\\s*:\\s*(Error|Warning)\\s*:\\s*(.*)$/gmi/1,3,2,0,4`, filePaths),
            // pddl4j pattern
            new ProblemPattern(`/(error|warning) at line (\\d+), column (\\d+), file \\(($(filePaths))\\)\\s*:\\s*(.+)/ig/4,1,2,3,5`, filePaths),
        ];

        if(this.customPattern){
            patterns.push(new ProblemPattern(this.customPattern, filePaths));
        }

        return patterns;
    }
}

interface ConfiguredParserOptions extends ParserOptions {
    customPattern: string;
    syntax: string;
}