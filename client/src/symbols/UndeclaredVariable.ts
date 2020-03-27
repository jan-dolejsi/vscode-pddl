/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, WorkspaceEdit, workspace, EndOfLine, Diagnostic } from 'vscode';
import { parser } from 'pddl-workspace';
import { FileInfo, Variable, Parameter } from 'pddl-workspace';

export class UndeclaredVariable {
    static readonly undeclaredVariableDiagnosticPattern = /^Undeclared symbol\s*:\s*([\w-]+)\s*/i;
    syntaxTree: parser.PddlSyntaxTree;

    constructor(fileInfo: FileInfo) {
        this.syntaxTree = new parser.PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();
    }

    getVariable(diagnostic: Diagnostic, document: TextDocument): [Variable, parser.PddlSyntaxNode] | undefined {

        let match = UndeclaredVariable.undeclaredVariableDiagnosticPattern.exec(diagnostic.message);
        if (!match) { return undefined; }
        let variableName = match[1];

        let lineWithUndeclaredVariable = document.lineAt(diagnostic.range.start.line);
        let variableNameMatch = lineWithUndeclaredVariable.text.match(new RegExp("\\(\\s*" + variableName + "[ |\\)]", "i"));
        if (variableNameMatch === null) { return undefined; }
        let undeclaredVariableOffset = document.offsetAt(lineWithUndeclaredVariable.range.start) + variableNameMatch.index! + variableNameMatch[0].toLowerCase().indexOf(variableName);

        let variableUsage = this.syntaxTree.getNodeAt(undeclaredVariableOffset + 1).expand();
        if (variableUsage.isDocument()) {
            console.log("Undeclared predicate/function was not found: " + variableName);
            return undefined;
        }
        let parameterNames = variableUsage.getNestedChildren()
            .filter(node => node.isType(parser.PddlTokenType.Parameter))
            .map(node => node.getText().replace('?', ''));

        let parameters = parameterNames.map(param => this.findParameterDefinition(variableUsage, param));

        if (parameters.some(p => !p)) {
            console.log("Undeclared predicate/function has some unexpected parameters: " + variableName);
            return undefined;
        }

        let validParameters = parameters.map(p => p as Parameter);

        return [new Variable(variableName, validParameters), variableUsage];
    }

    findParameterDefinition(variableUsage: parser.PddlSyntaxNode, parameterName: string): Parameter | undefined {
        let scope = variableUsage.findParametrisableScope(parameterName);
        let parameterDefinitionNode = scope && scope.getParameterDefinition();
        return parameterDefinitionNode &&
        parser.parseParameters(parameterDefinitionNode.getText())
                .find(p => p.name.toLowerCase() === parameterName.toLowerCase());
    }

    createEdit(document: TextDocument, variable: Variable, node: parser.PddlSyntaxNode): [WorkspaceEdit, VariableType] {
        var type = VariableType.Undecided;
        while (type === VariableType.Undecided && !node.isDocument()) {
            node = node.getParent()!;
            if (node.isType(parser.PddlTokenType.OpenBracketOperator)) {
                switch (node.getToken().tokenText) {
                    case "(+":
                    case "(-":
                    case "(/":
                    case "(*":
                    case "(<":
                    case "(<=":
                    case "(>":
                    case "(>=":
                    case "(=":
                    case "(assign":
                    case "(increase":
                    case "(decrease":
                    case "(scale-up":
                    case "(scale-down":
                    case "(sumall":
                        type = VariableType.Function;
                        break;
                    case "(and":
                    case "(not":
                    case "(or":
                    case "(at start":
                    case "(over all":
                    case "(at end":
                    case "(forall":
                        type = VariableType.Predicate;
                        break;
                }
            }
        }

        let newSectionName: string;
        switch (type) {
            case VariableType.Function:
                newSectionName = parser.PddlStructure.FUNCTIONS;
                break;
            case VariableType.Predicate:
                newSectionName = parser.PddlStructure.PREDICATES;
                break;
            default:
                throw new Error(`Could not determine whether ${variable.getFullName()} is a predicate or a function.`);
        }

        let defineNode = this.syntaxTree.getDefineNode();
        let sectionNode = defineNode.getFirstOpenBracket(newSectionName);

        let edit = new WorkspaceEdit();

        let indent1: string = UndeclaredVariable.createIndent(document, 1);
        let indent2: string = UndeclaredVariable.createIndent(document, 2);
        let eol = UndeclaredVariable.createEolString(document);

        if (sectionNode) {
            edit.insert(document.uri, document.positionAt(sectionNode.getEnd() - 1), indent1 + `(${variable.getFullName()})` + eol);
        } else {
            let previousSectionNode = parser.PddlStructure.findPrecedingSection(newSectionName, defineNode, parser.PddlStructure.PDDL_DOMAIN_SECTIONS);
            edit.insert(document.uri, document.positionAt(previousSectionNode.getEnd()), eol + indent1 + `(${newSectionName}${eol + indent2}(${variable.getFullName()})${eol + indent1})`);
        }

        return [edit, type];
    }

    static createEolString(document: TextDocument) {
        return document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
    }

    static createIndent(document: TextDocument, indentLevel: number): string {
        let config = workspace.getConfiguration('editor', document.uri);

        let indent: string;
        if (config.get<boolean>('insertSpaces')) {
            let tabSize = config.get<number>('tabSize', 4);
            indent = ' '.repeat(tabSize * indentLevel);
        }
        else {
            indent = '\t'.repeat(indentLevel);
        }
        return indent;
    }
}

export enum VariableType {
    Predicate,
    Function,
    Undecided
}