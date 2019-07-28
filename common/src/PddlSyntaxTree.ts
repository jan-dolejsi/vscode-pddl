/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlTokenizer, PddlToken, PddlTokenType } from "./PddlTokenizer";

/** Builds a syntax tree from PDDL syntax tokens. */
export class PddlSyntaxTree {

    // tokens in reverse order
    breadcrumbs: PddlToken[] = [];

    constructor(pddlText: string, private symbolIndex: number) {
        // tslint:disable-next-line:no-unused-expression
        new PddlTokenizer(pddlText, token => this.onToken(token), symbolIndex);
    }

    getBreadcrumbs(): PddlToken[] {
        return this.breadcrumbs.reverse();
    }

    onToken(token: PddlToken): void {
        if (token.start > this.symbolIndex) { return; }
        switch (token.type) {
            case PddlTokenType.Keyword:
                this.closeKeyword();
                this.breadcrumbs.unshift(token);
                break;
            case PddlTokenType.CloseBracket:
                this.closeBracket();
                break;
            default:
                if (this.inLeaf()) {
                    // remove the sibling
                    this.breadcrumbs.shift();
                }
                this.breadcrumbs.unshift(token);
                break;
        }
    }

    isInLeafType(types: PddlTokenType[]): boolean {
        if (this.breadcrumbs.length === 0) {
            return false;
        }

        let leafType = this.breadcrumbs[0].type;
        return types.includes(leafType);
    }

    inLeaf(): boolean {
        return this.isInLeafType([PddlTokenType.Comment,
        PddlTokenType.Other,
        PddlTokenType.Parameter,
        PddlTokenType.Dash,
        PddlTokenType.Whitespace]);
    }

    isOpenBracket(token: PddlToken): boolean {
        return token.type === PddlTokenType.OpenBracketOperator || token.type === PddlTokenType.OpenBracket;
    }

    closeBracket(): void {
        this.closeSibling(token => this.isOpenBracket(token), _token => false);
    }

    closeKeyword(): void {
        this.closeSibling(token => token.type === PddlTokenType.Keyword, token => this.isOpenBracket(token));
    }

    closeSibling(isSibling: (token: PddlToken) => boolean, isParent: (token:PddlToken) => boolean): void {
        // remove the other nested tokens
        while (this.breadcrumbs.length && !isSibling(this.breadcrumbs[0]) && !isParent(this.breadcrumbs[0])) {
            this.breadcrumbs.shift();
        }

        // remove the parent token
        if (this.breadcrumbs.length && isSibling(this.breadcrumbs[0]) && !isParent(this.breadcrumbs[0])) {
            this.breadcrumbs.shift();
        }
    }

}