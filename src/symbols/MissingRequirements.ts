/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, WorkspaceEdit } from 'vscode';
import { parser, FileInfo } from 'pddl-workspace';
import { UndeclaredVariable } from './UndeclaredVariable';

export class MissingRequirements {
    static readonly undeclaredRequirementDiagnosticPattern = /^undeclared requirement\s*:([\w-]+)/i;
    syntaxTree: parser.PddlSyntaxTree;

    constructor(fileInfo: FileInfo) {
        this.syntaxTree = new parser.PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();
    }

    getRequirementName(diagnosticMessage: string): string | undefined {
        const match = MissingRequirements.undeclaredRequirementDiagnosticPattern.exec(diagnosticMessage);
        if (!match) { return undefined; }
        let requirementName = ':' + match[1];

        // todo: remove this when the parser is fixed
        if (requirementName === ':number-fluents') {
            requirementName = ':fluents';
        }

        return requirementName;
    }

    createEdit(document: TextDocument, requirementName: string): WorkspaceEdit {
        const defineNode = this.syntaxTree.getDefineNode();
        const requirementsNode = defineNode.getFirstOpenBracket(':requirements');

        const edit = new WorkspaceEdit();

        if (requirementsNode) {
            edit.insert(document.uri, document.positionAt(requirementsNode.getEnd()-1), ' '  + requirementName);
        } else {
            let precedingNode: parser.PddlBracketNode | undefined = undefined;
            const domainNode = defineNode.getFirstOpenBracket('domain');
            if (domainNode) {
                // this is a domain file
                precedingNode = domainNode;
            }
            const problemNode = defineNode.getFirstOpenBracket('problem');
            if (problemNode) {
                // this is a problem file
                precedingNode = defineNode.getFirstOpenBracket(':domain');
            }
            if (precedingNode) {
                const indent = UndeclaredVariable.createIndent(document, 1);
                const eol = UndeclaredVariable.createEolString(document);
                edit.insert(document.uri, document.positionAt(precedingNode.getEnd()), eol + indent + `(:requirements ${requirementName})`);
            }
        }

        return edit;
    }
}