/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { FileInfo, Variable, DomainInfo } from 'pddl-workspace';
import { CodePddlWorkspace } from "../workspace/CodePddlWorkspace";
import { PddlWorkspace } from 'pddl-workspace';
import { languages, DiagnosticCollection, Diagnostic, DiagnosticSeverity, DiagnosticTag, Uri } from "vscode";
import { PDDL } from 'pddl-workspace';
import { toRange } from "../utils";

export const UNUSED = 'unused';

/**
 * Domain file diagnostics.
 */
export class DomainDiagnostics {
    diagnosticCollection: DiagnosticCollection;

    constructor(codePddlWorkspace: CodePddlWorkspace) {
        this.diagnosticCollection = languages.createDiagnosticCollection(PDDL+'2');
        codePddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
            if (fileInfo.isDomain()) {
                this.validateDomain(<DomainInfo>fileInfo);
            }
        });
    }

    validateDomain(domainInfo: DomainInfo) {
        let predicateDiagnostic = domainInfo.getPredicates()
            .map(p => this.toUnusedDiagnostic(domainInfo, p, 'predicate'))
            .filter(diagnostic => !!diagnostic)
            .map(diagnostics => diagnostics!);

        let functionDiagnostic = domainInfo.getFunctions()
            .map(p => this.toUnusedDiagnostic(domainInfo, p, 'function'))
            .filter(diagnostic => !!diagnostic)
            .map(diagnostics => diagnostics!);

        let diagnostics = predicateDiagnostic.concat(functionDiagnostic);

        this.diagnosticCollection.set(Uri.parse(domainInfo.fileUri), diagnostics);
    }

    toUnusedDiagnostic(domainInfo: DomainInfo, variable: Variable, variableType: string): Diagnostic | undefined {
        let references = domainInfo.getVariableReferences(variable);

        if (references.length === 1) {
            let diagnostic = new Diagnostic(toRange(references[0]), `Unused ${variableType} (${variable.declaredName})`, DiagnosticSeverity.Hint);
            diagnostic.tags = [DiagnosticTag.Unnecessary];
            diagnostic.code = UNUSED;
            return diagnostic;
        }

        return undefined;
    }
}