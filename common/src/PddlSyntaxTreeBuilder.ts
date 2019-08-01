/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlTokenizer, PddlToken, PddlTokenType } from "./PddlTokenizer";
import { PddlSyntaxTree, PddlSyntaxNode, PddlBracketNode } from "./PddlSyntaxTree";

/** Builds a syntax tree from PDDL syntax tokens. */
export class PddlSyntaxTreeBuilder {

    /** syntax tree */
    private tree: PddlSyntaxTree;
    /** most recently added node */
    private currentLeaf: PddlSyntaxNode;

    constructor(pddlText: string, private symbolIndex?: number) {
        this.tree = new PddlSyntaxTree();
        this.currentLeaf = this.tree.getRootNode();
        // tslint:disable-next-line:no-unused-expression
        new PddlTokenizer(pddlText, token => this.onToken(token), symbolIndex);
    }

    getBreadcrumbs(symbolIndex: number | undefined): PddlToken[] {
        let breadcrumbs: PddlToken[] = [];

        let nodeAtIndex = symbolIndex === undefined ? this.currentLeaf : this.tree.getNodeAt(symbolIndex);

        do {
            breadcrumbs.push(nodeAtIndex.getToken());
            nodeAtIndex = nodeAtIndex.getParent();
        } while (nodeAtIndex);

        return breadcrumbs.reverse();
    }

    getTree(): PddlSyntaxTree {
        return this.tree;
    }

    getTreeAsString(): string {
        return this.getNodeAsString(this.tree.getRootNode());
    }

    private getNodeAsString(node: PddlSyntaxNode): string {
        let childrenAsString = node.getChildren().map(c => this.getNodeAsString(c));
        return [node.toString()].concat(childrenAsString.map(s => this.indent(s))).join('\n');
    }
    private indent(s: string): string {
        return s.split('\n').map(line => "  " + line).join('\n');
    }

    private onToken(token: PddlToken): void {
        if (token.getStart() > this.symbolIndex) { return; }
        switch (token.type) {
            case PddlTokenType.Keyword:
                this.closeKeyword();
                this.addChild(token);
                break;
            case PddlTokenType.CloseBracket:
                this.closeBracket(token);
                break;
            default:
                if (this.inLeaf()) {
                    this.closeCurrentSibling();
                }
                this.addChild(token);
                break;
        }
    }

    private closeCurrentSibling() {
        this.currentLeaf = this.currentLeaf.getParent();
    }

    private addChild(token: PddlToken) {
        const newChild = this.isOpenBracket(token) ? 
            new PddlBracketNode(token, this.currentLeaf) : 
            new PddlSyntaxNode(token, this.currentLeaf);
        this.currentLeaf.addChild(newChild);
        this.currentLeaf = newChild;
    }

    private isInLeafOfType(expectedTypes: PddlTokenType[]): boolean {
        const actualType = this.currentLeaf.getToken().type;
        return expectedTypes.includes(actualType);
    }

    private inLeaf(): boolean {
        return this.isInLeafOfType([PddlTokenType.Comment,
        PddlTokenType.Other,
        PddlTokenType.Parameter,
        PddlTokenType.Dash,
        PddlTokenType.Whitespace]);
    }

    private isOpenBracket(token: PddlToken): boolean {
        return token.type === PddlTokenType.OpenBracketOperator || token.type === PddlTokenType.OpenBracket;
    }

    private closeBracket(closeBracketToken: PddlToken): void {
        let openBracketNode = this.closeSibling(token => this.isOpenBracket(token), _token => false);

        if (openBracketNode) {
            (<PddlBracketNode>openBracketNode).setCloseBracket(closeBracketToken);
        }
    }

    private closeKeyword(): void {
        this.closeSibling(token => token.type === PddlTokenType.Keyword, token => this.isOpenBracket(token));
    }

    private closeSibling(isSibling: (token: PddlToken) => boolean, isParent: (token: PddlToken) => boolean): PddlSyntaxNode {
        // exit out of the other nested token(s)
        while (!isSibling(this.currentLeaf.getToken()) && !isParent(this.currentLeaf.getToken())) {
            this.currentLeaf = this.currentLeaf.getParent();   
        }

        // exit out the parent token
        if (isSibling(this.currentLeaf.getToken()) && !isParent(this.currentLeaf.getToken())) {
            let sibling = this.currentLeaf;
            this.currentLeaf = this.currentLeaf.getParent();   
            return sibling;
        }
        else {
            return null;
        }
    }
}