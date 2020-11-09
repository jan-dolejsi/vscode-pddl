/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { FileInfo, ParsingProblem, ParsingProblemSeverity, utils } from 'pddl-workspace';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode';
import { URI } from 'vscode-uri';
import { toRange } from '../utils';


export function createRangeFromLine(errorLine: number, errorColumn = 0): Range {
    return new Range(errorLine, errorColumn, errorLine, errorColumn + 100);
}

export function createDiagnostic(errorLine: number, errorColumn: number, error: string, severity: DiagnosticSeverity): Diagnostic {
    return new Diagnostic(createRangeFromLine(errorLine, errorColumn), error, severity);
}

function toDiagnosticSeverity(severity: ParsingProblemSeverity): DiagnosticSeverity {
    switch (severity) {
        case "error":
            return DiagnosticSeverity.Error;
        case "warning":
            return DiagnosticSeverity.Warning;
        case "info":
            return DiagnosticSeverity.Information;
        case "hint":
            return DiagnosticSeverity.Hint;
        default:
            throw new Error("Unexpected severity: " + severity);
    }
}

export function createDiagnosticFromParsingProblem(problem: ParsingProblem): Diagnostic {
    return new Diagnostic(toRange(problem.range), problem.problem, toDiagnosticSeverity(problem.severity));
}

export function toDiagnosticsFromParsingProblems(problems: ParsingProblem[]): Diagnostic[] {
    return problems.map(p => createDiagnosticFromParsingProblem(p));
}


export function toDiagnostics(parsingErrors: utils.StringifyingMap<URI, ParsingProblem[]>, allParsed: FileInfo[]): Map<string, Diagnostic[]> {
    const diagnostics = new Map<string, Diagnostic[]>();

    parsingErrors.forEach((problems, uri) =>
        diagnostics.set(uri, toDiagnosticsFromParsingProblems(problems)));

    // add empty diagnostic lists for files that are deemed valid (to make sure the previously identified issues are cleared from the UI)
    allParsed
        .filter(file => !diagnostics.has(file.fileUri.toString()))
        .forEach(validFile => diagnostics.set(validFile.fileUri.toString(), []));
    
    return diagnostics;
}
