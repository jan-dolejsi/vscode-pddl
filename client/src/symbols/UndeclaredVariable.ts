/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, WorkspaceEdit, workspace, EndOfLine, Diagnostic } from 'vscode';
import { PddlSyntaxTreeBuilder } from '../../../common/src/PddlSyntaxTreeBuilder';
import { PddlSyntaxTree } from '../../../common/src/PddlSyntaxTree';
import { FileInfo, Variable, Parameter } from '../../../common/src/FileInfo';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { parseParameters } from '../../../common/src/VariablesParser';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';

export class UndeclaredVariable {
    static readonly undeclaredVariableDiagnosticPattern = /^Undeclared symbol\s*:\s*([\w-]+)\s*/i;
    syntaxTree: PddlSyntaxTree;

    constructor(fileInfo: FileInfo) {
        this.syntaxTree = new PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();
    }

    getVariable(diagnostic: Diagnostic, document: TextDocument): [Variable, PddlSyntaxNode] {

        let match = UndeclaredVariable.undeclaredVariableDiagnosticPattern.exec(diagnostic.message);
        if (!match) { return undefined; }
        let variableName = match[1];

        let lineWithUndeclaredVariable = document.lineAt(diagnostic.range.start.line);
        let variableNameMatch = lineWithUndeclaredVariable.text.match(new RegExp("\\(\\s*" + variableName + "[ |\\)]", "i"));
        if (!variableNameMatch) { return undefined; }
        let undeclaredVariableOffset = document.offsetAt(lineWithUndeclaredVariable.range.start) + variableNameMatch.index + variableNameMatch[0].indexOf(variableName);

        let variableUsage = this.syntaxTree.getNodeAt(undeclaredVariableOffset + 1).expand();
        if (!variableUsage) {
            console.log("Undeclared predicate/function was not found: " + variableName);
            return undefined;
        }
        let parameterNames = variableUsage.getNestedChildren()
            .filter(node => node.isType(PddlTokenType.Parameter))
            .map(node => node.getText().replace('?', ''));

        let parameters = parameterNames.map(param => this.findParameterDefinition(variableUsage, param));

        return [new Variable(variableName, parameters), variableUsage];
    }

    findParameterDefinition(variableUsage: PddlSyntaxNode, parameterName: string): Parameter {
        let scope = variableUsage.findParametrisableScope(parameterName);
        let parameterDefinitionNode = scope && scope.getParameterDefinition();
        return parseParameters(parameterDefinitionNode.getText()).find(p => p.name === parameterName);
    }

    createEdit(document: TextDocument, variable: Variable, node: PddlSyntaxNode): [WorkspaceEdit, VariableType] {
        var type = VariableType.Undecided;
        while (type === VariableType.Undecided && !node.isDocument()) {
            node = node.getParent();
            if (node.isType(PddlTokenType.OpenBracketOperator)) {
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
                        type = VariableType.Function;
                        break;
                    case "(and":
                    case "(not":
                    case "(or":
                    case "(at start":
                    case "(over all":
                    case "(at end":
                        type = VariableType.Predicate;
                        break;
                }
            }
        }

        let newSectionName: string;
        switch (type) {
            case VariableType.Function:
                newSectionName = UndeclaredVariable.FUNCTIONS;
                break;
            case VariableType.Predicate:
                newSectionName = UndeclaredVariable.PREDICATES;
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
            let previousSectionNode = this.findPrecedingSection(newSectionName, defineNode);
            edit.insert(document.uri, document.positionAt(previousSectionNode.getEnd()), eol + indent1 + `(${newSectionName}${eol + indent2}(${variable.getFullName()})${eol + indent1})`);
        }

        return [edit, type];
    }

    static readonly PREDICATES = ':predicates';
    static readonly FUNCTIONS = ':functions';
    static readonly PDDL_DOMAIN_SECTIONS = ['domain', ':requirements', ':types', ':constants', UndeclaredVariable.PREDICATES, UndeclaredVariable.FUNCTIONS, ':derived', ':action', ':constraints', ':durative-actions', ':process', '::event'];

    findPrecedingSection(newSectionName: string, defineNode: PddlSyntaxNode): PddlSyntaxNode {
        let precedingSections = UndeclaredVariable.PDDL_DOMAIN_SECTIONS.slice(0, UndeclaredVariable.PDDL_DOMAIN_SECTIONS.indexOf(newSectionName));
        // let followingSections = UndeclaredVariable.PDDL_DOMAIN_SECTIONS.slice(UndeclaredVariable.PDDL_DOMAIN_SECTIONS.indexOf(newSectionName)+1);

        let previousSectionNode = defineNode;

        for (let index = 0; index < precedingSections.length; index++) {
            let node = defineNode.getFirstOpenBracket(precedingSections[index]);
            if (node) {
                previousSectionNode = node;
            }
        }

        return previousSectionNode;
    }

    static createEolString(document: TextDocument) {
        return document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
    }

    static createIndent(document: TextDocument, indentLevel: number): string {
        let config = workspace.getConfiguration('editor', document.uri);

        let indent: string;
        if (config.get<boolean>('insertSpaces')) {
            let tabSize = config.get<number>('tabSize');
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