/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Diagnostic, DiagnosticSeverity, Range, Position
} from 'vscode';

import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';

export abstract class Validator {

    constructor(public path: string) { }

    abstract validate(domainInfo: DomainInfo, problemFiles: ProblemInfo[], onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): void;

    createEmptyDiagnostics(domainInfo: DomainInfo, problemFiles: ProblemInfo[]): Map<string, Diagnostic[]>{
        const diagnostics: Map<string, Diagnostic[]> = new Map<string, Diagnostic[]>();
        diagnostics.set(domainInfo.fileUri.toString(), []);
        problemFiles.forEach(p => diagnostics.set(p.fileUri.toString(), []));
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
        const position = new Position(line, character);
        return new Range(position, position);
    }

    static createLineRange(line: number): Range {
        return new Range(new Position(line,  0), new Position(line, Number.MAX_VALUE));
    }
}
