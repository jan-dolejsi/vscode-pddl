/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlToken, PddlTokenType, TextRange } from "./PddlTokenizer";

/** Represents a syntax tree of a PDDL document. */
export class PddlSyntaxTree {
    private root: PddlSyntaxNode;
    
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
            // todo: use binary search among chindren
            let firstMatchingChild = parent.getChildren().find(node => node.includesIndex(symbolIndex));
            return this.getChildNodeAt(firstMatchingChild, symbolIndex);
        }
    }
}

/** Single node in the syntax tree that wraps one PDDL tokenizer token. */
export class PddlSyntaxNode extends TextRange {

    private children: PddlSyntaxNode[] = [];

    private maxChildEnd: number;
    
    /**
     * Creates the syntax tree node.
     * @param token pddl token wrapped by this node
     * @param parent parent node, unless this is the root node
     */
    constructor(private token: PddlToken, private parent?: PddlSyntaxNode) {
        super();
        this.maxChildEnd = token.getEnd();
    }

    static createRoot(): PddlSyntaxNode {
        return new PddlSyntaxNode(new PddlToken(PddlTokenType.Document, '', 0), undefined);
    }

    isRoot(): boolean {
        return this.parent === undefined;
    }

    getParent(): PddlSyntaxNode | undefined {
        return this.parent;
    }

    getToken(): PddlToken {
        return this.token;
    }

    addChild(childNode: PddlSyntaxNode): void {
        this.children.push(childNode);
        this.recalculateEnd(childNode);
    }

    recalculateEnd(childNode: TextRange) {
        this.maxChildEnd = Math.max(this.maxChildEnd, childNode.getEnd());
        if (this.parent) { this.parent.recalculateEnd(this); }
    }

    getChildren(): PddlSyntaxNode[] {
        return this.children;
    }

    getSingleChild(): PddlSyntaxNode {
        if (this.children.length !== 1) {
            throw new Error(`Failed assertion that node '${this.toString()}' has a single child.`);
        }
        return this.children[0];
    }

    getNonWhitespaceChildren(): PddlSyntaxNode[] {
        return this.children.filter(c => c.getToken().type !== PddlTokenType.Whitespace);
    }

    getSingleNonWhitespaceChild(): PddlSyntaxNode {
        let nonWhitespaceChildren = this.getNonWhitespaceChildren();
        if (nonWhitespaceChildren.length !== 1) {
            throw new Error(`Failed assertion that node '${this.toString()}' has a single non-whitespace child.`);
        }
        return nonWhitespaceChildren[0];
    }

    hasChildren(): boolean {
        return this.children.length > 0;
    }

    getStart(): number {
        return this.token.getStart();
    }

    getEnd(): number {
        return this.maxChildEnd;
    }

    toString(): string {
        return `${this.token.type}: text: '${this.token.tokenText.split(/\r?\n/).join('\\n')}', range: ${this.getStart()}~${this.getEnd()}}`;
    }
}

/** Specialized tree node for open/close bracket pair. */
export class PddlBracketNode extends PddlSyntaxNode {
    private closeToken: PddlToken;
    private _isClosed : boolean;

    /**
     * Sets the bracket close token.
     * @param token pddl bracket close token
     */
    setCloseBracket(token: PddlToken): void {
        this._isClosed = true;
        this.closeToken = token;
        this.recalculateEnd(token);
    }

    getCloseBracket(): PddlToken {
        return this.closeToken;
    }
    
    public get isClosed() : boolean {
        return this._isClosed;
    }
}
