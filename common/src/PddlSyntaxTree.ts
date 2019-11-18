/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlSyntaxNode } from "./PddlSyntaxNode";

/** Represents a syntax tree of a PDDL document. */
export class PddlSyntaxTree {
    private root: PddlSyntaxNode;
    static readonly EMPTY: PddlSyntaxTree = new PddlSyntaxTree();
    
    constructor() {
        this.root = PddlSyntaxNode.createRoot();
    }

    getRootNode(): PddlSyntaxNode {
        return this.root;
    }

    /**
     * Finds the node at given index in the document text.
     * @param symbolIndex index in the document text, where the node is located
     */
    getNodeAt(symbolIndex: number): PddlSyntaxNode {
        return this.getChildNodeAt(this.root, symbolIndex);
    }

    private getChildNodeAt(parent: PddlSyntaxNode, symbolIndex: number): PddlSyntaxNode {
        if (!parent.includesIndex(symbolIndex)) {
            throw new Error(`Index ${symbolIndex} is not included in the scope of ${parent.toString()}.`);
        }

        if (!parent.hasChildren()) {
            return parent;
        }
        else if (parent.getToken().includesIndex(symbolIndex)) {
            return parent;
        }
        else {
            // todo: use binary search among children
            let firstMatchingChild = parent.getChildren().find(node => node.includesIndex(symbolIndex));
            if (!firstMatchingChild) { throw new Error("Assertion failed: there should be a child at index: " + symbolIndex); }
            return this.getChildNodeAt(firstMatchingChild, symbolIndex);
        }
    }

    getDefineNode(): PddlSyntaxNode {
        return this.getRootNode().getFirstOpenBracket('define');
    }

    getDefineNodeOrThrow(): PddlSyntaxNode {
        return this.getRootNode().getFirstOpenBracketOrThrow('define');
    }
}
