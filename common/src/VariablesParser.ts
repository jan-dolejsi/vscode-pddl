/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { Variable, Parameter } from "./FileInfo";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";

/** Parses the `:predicates` and `:functions` section. */
export class VariablesParser {

    private variables = new Array<Variable>();

    chunks = new Array<PddlSyntaxNode[]>();
    currentVariableNodes = new Array<PddlSyntaxNode>();
    variableNodeEncountered = false;
    consecutiveVerticalWhitespaceCount = 0;

    constructor(predicatesNode: PddlSyntaxNode, private positionResolver: DocumentPositionResolver) {

        // first split the list of children to chunks describing one variable
        this.chunkByVerticalWhitespace(predicatesNode);

        this.variables = this.chunks
            .map(chunk => this.processChunk(chunk))
            .filter(var1 => var1 !== undefined);
    }

    private chunkByVerticalWhitespace(predicatesNode: PddlSyntaxNode) {
        for (const node of predicatesNode.getNestedChildren()) {
            if (node.getToken().type === PddlTokenType.Whitespace) {
                const verticalWhitespaceCount = node.getText().split(/\r?\n/).length - 1;
                // did we encountered end of the line AFTER the variable declaration?
                if (verticalWhitespaceCount > 0 && this.variableNodeEncountered) {
                    // this is the end of one variable declaration
                    this.addCurrentVariableChunkAndReset();
                }
                this.consecutiveVerticalWhitespaceCount += verticalWhitespaceCount;
                if (this.consecutiveVerticalWhitespaceCount >= 2) {
                    // empty line encountered, reset
                    this.reset();
                }
            }
            else {
                // reset the EOL counter as this is not a vertical whitespace
                this.consecutiveVerticalWhitespaceCount = 0;
                if (node.getToken().type === PddlTokenType.OpenBracket) {
                    this.variableNodeEncountered = true;
                }
                this.currentVariableNodes.push(node);
            }
        }
        // push the last chunk
        if (this.currentVariableNodes.length) {
            this.addCurrentVariableChunkAndReset();
        }
    }

    private processChunk(chunk: PddlSyntaxNode[]): Variable {
        let documentation = new Array<string>();
        let variable: Variable = undefined;
        let variableNode: PddlSyntaxNode;

        for (const node of chunk) {

            if (node.getToken().type === PddlTokenType.Comment) {
                let indexOfSemicolon = node.getText().indexOf(';');
                if (indexOfSemicolon > -1) {
                    let textAfterSemicolon = node.getText().substr(indexOfSemicolon + 1).trim();
                    documentation.push(textAfterSemicolon);
                }
            }
            else if (node.getToken().type === PddlTokenType.OpenBracket) {
                variableNode = node;
                let fullSymbolName = node.getNestedText();
                let parameters = parseParameters(fullSymbolName);
                variable = new Variable(fullSymbolName, parameters);
            }
        }

        if (!variable) {
            // there was no predicate/function in this chunk
            return undefined;
        }
        variable.setDocumentation(documentation);
        let startPosition = this.positionResolver.resolveToPosition(variableNode.getStart());
        let endPosition = this.positionResolver.resolveToPosition(variableNode.getEnd());
        variable.setLocation(PddlRange.from(startPosition, endPosition));

        return variable;
    }

    private addCurrentVariableChunkAndReset() {
        this.chunks.push(this.currentVariableNodes);
        this.reset();
    }

    /** Resets the current variable chunk */
    private reset() {
        this.currentVariableNodes = [];
        this.variableNodeEncountered = false;
        this.consecutiveVerticalWhitespaceCount = 0;
    }

    static isVerticalWhitespace(node: PddlSyntaxNode): boolean {
        return node.getToken().type === PddlTokenType.Whitespace
            && /[\r\n]/.test(node.getToken().tokenText);
    }

    getVariables(): Variable[] {
        return this.variables;
    }

}

export function parseParameters(fullSymbolName: string): Parameter[] {
    let parameterPattern = /((\?[\w]+\s+)+)-\s+([\w][\w-]*)/g;

    let parameters: Parameter[] = [];

    let group: RegExpExecArray;

    while (group = parameterPattern.exec(fullSymbolName)) {
        let variables = group[1];
        let type = group[3];

        variables.split(/(\s+)/)
            .filter(term => term.trim().length)
            .map(variable => variable.substr(1).trim()) // skip the question-mark
            .forEach(variable => parameters.push(new Parameter(variable, type)));
    }

    return parameters;
}
