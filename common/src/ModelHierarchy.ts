/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, DurativeAction, InstantAction, PddlDomainConstruct, UnrecognizedStructure } from "./DomainInfo";
import { Variable } from "./FileInfo";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { PddlRange } from "./DocumentPositionResolver";
import { ActionEffectParser, VariableEffect, Effect } from "./ActionEffectParser";

export class ModelHierarchy {
    constructor(private domainInfo: DomainInfo) {

    }

    private rangeIncludesOffset(range: PddlRange, offset: number) {
        return this.domainInfo.getDocumentPositionResolver()
            .rangeIncludesOffset(range, offset);
    }

    getReferenceInfo(variableInfo: Variable, startOffset: number): VariableReferenceInfo {
        let referenceNode = this.domainInfo.syntaxTree.getNodeAt(startOffset);

        let domainActionFound = this.domainInfo.getStructures()
            .filter(domainAction => domainAction.getLocation() !== undefined)
            .find(domainAction => this.rangeIncludesOffset(domainAction.getLocation()!, startOffset));

        // todo: support constraints
        // let constraintFound = this.domainInfo.getConstraints()
        //     .find(c => c.node.includesIndex(startOffset));

        if (domainActionFound) {
            if (domainActionFound instanceof DurativeAction) {
                let durativeAction = <DurativeAction>domainActionFound;

                // is it referenced by the duration?
                if (durativeAction.duration?.includesIndex(startOffset)) {
                    return this.getReadOnlyReferenceInfo(referenceNode, variableInfo, durativeAction, "duration");
                }
                // read by a condition?
                else if (durativeAction.condition?.includesIndex(startOffset)) {
                    let timeQualifierNode = ModelHierarchy.findConditionTimeQualifier(referenceNode);
                    return this.getConditionReferenceInfo(referenceNode, variableInfo, durativeAction, timeQualifierNode);
                }
                // accessed by an effect?
                else if (durativeAction.effect?.includesIndex(startOffset)) {
                    let timeQualifierNode = ModelHierarchy.findConditionTimeQualifier(referenceNode);
                    return this.getEffectReferenceInfo(referenceNode, variableInfo, durativeAction, timeQualifierNode);
                }
                else {
                    return new VariableReferenceInfo(durativeAction, undefined, "", VariableReferenceKind.UNRECOGNIZED, referenceNode.expand().getText());
                }
            } else if (domainActionFound instanceof InstantAction) {
                let instantAction = <InstantAction>domainActionFound;

                // read by a condition?
                if (instantAction.preCondition?.includesIndex(startOffset)) {
                    return this.getConditionReferenceInfo(referenceNode, variableInfo, instantAction, undefined);
                }
                // accessed by an effect?
                else if (instantAction.effect?.includesIndex(startOffset)) {
                    return this.getEffectReferenceInfo(referenceNode, variableInfo, instantAction);
                }
                else {
                    return new VariableReferenceInfo(instantAction, undefined, "", VariableReferenceKind.UNRECOGNIZED, "");
                }
            } else {
                throw new Error("Unexpected action type.");
            }
        }
        // else if (constraintFound) {
        // todo: support for constraint
        // }
        else {
            return new UnrecognizedVariableReferenceInfo();
        }
    }

    private getConditionReferenceInfo(referenceNode: PddlSyntaxNode, _variableInfo: Variable, structure: PddlDomainConstruct, timeQualifierNode?: PddlSyntaxNode): VariableReferenceInfo {
        return this.getReadOnlyReferenceInfo(referenceNode, _variableInfo, structure, "condition", timeQualifierNode);
    }

    private getReadOnlyReferenceInfo(referenceNode: PddlSyntaxNode, _variableInfo: Variable, structure: PddlDomainConstruct, part: string, timeQualifierNode?: PddlSyntaxNode): VariableReferenceInfo {
        var conditionNode = referenceNode;
        while (!['(=', '(>', '(<', '(>=', '(<=', '(not'].includes(conditionNode.getToken().tokenText)) {
            let parentNode = conditionNode.getParent() || conditionNode;

            if (parentNode === timeQualifierNode ||
                parentNode.isType(PddlTokenType.Keyword) ||
                parentNode.isDocument() ||
                ['(and', '(at start', '(at end', '(over all'].includes(parentNode.getToken().tokenText.toLowerCase())) {
                break;
            }

            conditionNode = parentNode;
        }

        return new VariableReferenceInfo(structure, timeQualifierNode, part, VariableReferenceKind.READ, conditionNode.getText());
    }

    private getEffectReferenceInfo(referenceNode: PddlSyntaxNode, variableInfo: Variable, structure: PddlDomainConstruct, timeQualifierNode?: PddlSyntaxNode): VariableReferenceInfo {
        var effectNode = referenceNode;
        while (!['(increase', '(decrease', '(scale-up', '(scale-down', '(assign', '(not'].includes(effectNode.getToken().tokenText)) {
            let parentNode = effectNode.getParent() || effectNode;

            if (parentNode === timeQualifierNode ||
                parentNode.isType(PddlTokenType.Keyword) ||
                parentNode.isDocument() ||
                ['(and', '(at start', '(at end'].includes(parentNode.getToken().tokenText.toLowerCase())) {
                break;
            }

            effectNode = parentNode;
        }

        let effect = ActionEffectParser.parseEffect(effectNode);

        let kind = effect instanceof VariableEffect && effect.modifies(variableInfo) ?
            VariableReferenceKind.WRITE : VariableReferenceKind.READ;

        return new VariableEffectReferenceInfo(structure, timeQualifierNode, "effect", kind, effect, effect.toPddlString());
    }

    static isInsideCondition(currentNode: PddlSyntaxNode): boolean {
        return ModelHierarchy.findConditionAncestor(currentNode) !== undefined;
    }

    private static findConditionAncestor(currentNode: PddlSyntaxNode): PddlSyntaxNode | undefined {
        return currentNode.findAncestor(PddlTokenType.Keyword, /^\s*:condition$/i);
    }

    static isInsideDurativeActionUnqualifiedCondition(currentNode: PddlSyntaxNode): boolean {
        return ModelHierarchy.findDurativeActionAncestor(currentNode) !== undefined
            && ModelHierarchy.findConditionTimeQualifier(currentNode) === undefined;
    }

    private static findDurativeActionAncestor(currentNode: PddlSyntaxNode): PddlSyntaxNode | undefined {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /^\(\s*:durative-action/i);
    }

    private static findConditionTimeQualifier(currentNode: PddlSyntaxNode): PddlSyntaxNode | undefined {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /^\(\s*(at\s+start|at\s+end|over\s+all)/i);
    }

    static isInsideDurativeActionDiscreteEffect(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*:durative-action/i) !== undefined
            && currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*(at start|at end)/i) !== undefined;
    }

    static isInsideActionOrEvent(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*:(action|event)/i) !== undefined;
    }

    static isInsideEffect(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.Keyword, /^\s*:effect$/i) !== undefined;
    }

    static isInsideDurativeActionUnqualifiedEffect(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*:durative-action/i) !== undefined
            && currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*(at start|at end)/i) === undefined;
    }

    static isInsideProcess(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*:process/i) !== undefined;
    }

}

export class ReferenceInfo {
    constructor() {

    }
}

export class VariableReferenceInfo extends ReferenceInfo {
    constructor(public readonly structure: PddlDomainConstruct | undefined,
        private timeQualifierNode: PddlSyntaxNode | undefined,
        public readonly part: string,
        public readonly kind: VariableReferenceKind,
        public readonly relevantCode?: string) {
        super();
    }

    getTimeQualifier(): string {
        return this.timeQualifierNode?.getToken().tokenText.substr(1) || "";
    }

    toString(): string {
        return `Accessed by structure \`${this.structure?.getNameOrEmpty()}\` *${this.getTimeQualifier()}* ${this.part}`;
    }
}

export class VariableEffectReferenceInfo extends VariableReferenceInfo {
    constructor(structure: PddlDomainConstruct | undefined,
        timeQualifierNode: PddlSyntaxNode | undefined,
        part: string,
        kind: VariableReferenceKind,
        public readonly effect: Effect,
        relevantCode?: string) {
        super(structure, timeQualifierNode, part, kind, relevantCode);
    }
}

export class UnrecognizedVariableReferenceInfo extends VariableReferenceInfo {
    constructor() {
        super(new UnrecognizedStructure(), undefined, "", VariableReferenceKind.UNRECOGNIZED, "");
    }
}

export enum VariableReferenceKind {
    READ,
    READ_OR_WRITE,
    WRITE,
    UNRECOGNIZED
}