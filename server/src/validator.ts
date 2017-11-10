/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic, DiagnosticSeverity, Range
} from 'vscode-languageserver';

import { DomainInfo, ProblemInfo } from '../../common/src/parser';

export abstract class Validator {
    PDDL = 'pddl';

    constructor(public path: string) { }

    abstract validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void;

    createEmptyDiagnostics(domainInfo: DomainInfo, problemFiles: ProblemInfo[]): Map<string, Diagnostic[]>{
        let diagnostics: Map<string, Diagnostic[]> = new Map<string, Diagnostic[]>();
        diagnostics.set(domainInfo.fileUri, []);
        problemFiles.forEach(p => diagnostics.set(p.fileUri, []));
        return diagnostics;
    }

    static toSeverity(severity: string): DiagnosticSeverity {
        switch (severity.toLowerCase()) {
            case "error":
                return DiagnosticSeverity.Error;
            case "warning":
                return DiagnosticSeverity.Warning;
            case "info":
                return DiagnosticSeverity.Information;
            default:
                return DiagnosticSeverity.Hint;
        }
    }

    static createRange(line: number, character: number): Range {
        return {
            start: { line: line, character: character },
            end: { line: line, character: character },
        }
    }

    static createLineRange(line: number): Range {
        return {
            start: { line: line, character: 0 },
            end: { line: line, character: Number.MAX_VALUE },
        }
    }
}
