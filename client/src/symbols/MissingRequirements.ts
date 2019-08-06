/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, WorkspaceEdit, workspace, EndOfLine } from 'vscode';
// import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { PddlSyntaxTreeBuilder } from '../../../common/src/PddlSyntaxTreeBuilder';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { PddlSyntaxNode, PddlSyntaxTree } from '../../../common/src/PddlSyntaxTree';
import { FileInfo } from '../../../common/src/FileInfo';

export class MissingRequirements {
    static readonly undeclaredRequirementDiagnosticPattern = /^undeclared requirement\s*:([\w-]+)/i;
    syntaxTree: PddlSyntaxTree;

    constructor(fileInfo: FileInfo) {
        this.syntaxTree = new PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();
    }

    getRequirementName(diagnosticMessage: string): string {
        let match = MissingRequirements.undeclaredRequirementDiagnosticPattern.exec(diagnosticMessage);
        if (!match) { return undefined; }
        let requirementName = ':' + match[1];

        // todo: remove this when the parser is fixed
        if (requirementName === ':number-fluents') {
            requirementName = ':fluents';
        }

        return requirementName;
    }

    createEdit(document: TextDocument, requirementName: string): WorkspaceEdit {
        let defineNode = this.findDefineNode();
        let requirementsNode = defineNode.getFirstChild(PddlTokenType.OpenBracketOperator, /\(\s*:requirements/);

        let edit = new WorkspaceEdit();

        if (requirementsNode) {
            edit.insert(document.uri, document.positionAt(requirementsNode.getEnd()-1), ' '  + requirementName);
        } else {
            let domainNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\(\s*domain/);
            let config = workspace.getConfiguration('editor', document.uri);
            let indent: string;
            if (config.get<boolean>('insertSpaces')) {
                let tabSize = config.get<number>('tabSize');
                indent = ' '.repeat(tabSize);
            }
            else {
                indent = '\t';
            }
            let eol = document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
            edit.insert(document.uri, document.positionAt(domainNode.getEnd()), eol + indent + `(:requirements ${requirementName})`);
        }

        return edit;
    }

    findDefineNode(): PddlSyntaxNode {
        return this.syntaxTree.getRootNode()
            .getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\(\s*define/);
    }
}