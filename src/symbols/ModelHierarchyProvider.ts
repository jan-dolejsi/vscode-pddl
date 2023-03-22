/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { HoverProvider, TextDocument, Position, CancellationToken, Hover, MarkdownString, ExtensionContext, TextEditor, TextEditorDecorationType, Location } from 'vscode';
import { VariableInfo, SymbolInfo } from './SymbolUtils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { ModelHierarchy, VariableReferenceInfo, VariableReferenceKind, VariableEffectReferenceInfo, FileInfo } from 'pddl-workspace';
import { PDDL } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { Variable } from 'pddl-workspace';
import { toPosition } from '../utils';
import { parser } from 'pddl-workspace';
import { DecorationRelativePosition, SyntaxAugmenter } from '../syntax/SyntaxAugmenter';

/** Shows decorations in the PDDL domain. */
export class ModelHierarchyProvider extends SyntaxAugmenter implements HoverProvider {

    constructor(context: ExtensionContext, pddlWorkspace: CodePddlWorkspace) {
        super(context, pddlWorkspace);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isApplicable(_file: FileInfo): boolean {
        return true;
    }

    getHoverProvider(): HoverProvider | undefined {
        return this;
    }

    protected createDecoration(editor: TextEditor, fileInfo: FileInfo): TextEditorDecorationType[] {
        if (fileInfo instanceof DomainInfo) {
            const domainInfo = fileInfo as DomainInfo;

            const allVariables = domainInfo.getFunctions().concat(domainInfo.getPredicates());
            //todo: add derived variables

            const decorations = allVariables.map(v => this.decorateVariable(v, editor, domainInfo))
                .filter(dec => !!dec)
                .map(dec => dec!);
            return decorations;
        }
        return [];
    }

    decorateVariable(variable: Variable, editor: TextEditor, domainInfo: DomainInfo): TextEditorDecorationType | undefined {
        const symbolInfo = this.symbolUtils.getSymbolInfo(editor.document, toPosition(variable.getLocation().start).translate({ characterDelta: 1 }));

        if (symbolInfo instanceof VariableInfo) {
            const references = this.symbolUtils.findSymbolReferences(editor.document, symbolInfo, false);
            const pddlFileInfo = this.pddlWorkspace.getFileInfo(editor.document);
            if (!pddlFileInfo) { return undefined; }

            if (references !== undefined && domainInfo !== undefined) {
                const referenceInfos = this.getReferences(references, domainInfo, symbolInfo, editor.document);

                const readCount = referenceInfos
                    .filter(ri => [VariableReferenceKind.READ, VariableReferenceKind.READ_OR_WRITE].includes(ri.kind))
                    .length;

                const writeReferences = referenceInfos
                    .filter(ri => [VariableReferenceKind.WRITE, VariableReferenceKind.READ_OR_WRITE].includes(ri.kind));
                const writeEffectReferences = writeReferences
                    .filter(ri => (ri instanceof VariableEffectReferenceInfo))
                    .map(ri => ri as VariableEffectReferenceInfo);

                const increaseCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.IncreaseEffect).length;
                const decreaseCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.DecreaseEffect).length;
                const scaleUpCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.ScaleUpEffect).length;
                const scaleDownCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.ScaleDownEffect).length;
                const assignCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.AssignEffect).length;
                const makeTrueCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.MakeTrueEffect).length;
                const makeFalseCount = writeEffectReferences.filter(ri => ri.effect instanceof parser.MakeFalseEffect).length;

                const decorationText: string[] = [];
                const hoverText: string[] = [];

                if (readCount) {
                    decorationText.push(`${readCount}👁`);
                    hoverText.push(`${readCount}x read`);
                }

                if (increaseCount) {
                    decorationText.push(`${increaseCount}↗`);
                    hoverText.push(`${increaseCount}x increased`);
                }

                if (decreaseCount) {
                    decorationText.push(`${decreaseCount}↘`);
                    hoverText.push(`${decreaseCount}x decreased`);
                }

                if (scaleUpCount) {
                    decorationText.push(`${scaleUpCount}⤴`);
                    hoverText.push(`${scaleUpCount}x scaled up`);
                }

                if (scaleDownCount) {
                    decorationText.push(`${scaleDownCount}⤵`);
                    hoverText.push(`${scaleDownCount}x scaled down`);
                }

                if (assignCount) {
                    decorationText.push(`${assignCount}≔`);
                    hoverText.push(`${assignCount}x assigned`);
                }

                if (makeTrueCount) {
                    decorationText.push(`${makeTrueCount}☑`);// ⊨
                    hoverText.push(`${makeTrueCount}x made true`);
                }
                if (makeFalseCount) {
                    decorationText.push(`${makeFalseCount}☒`);// ⊭ 
                    hoverText.push(`${makeFalseCount}x made false`);
                }

                const rest = referenceInfos.length - readCount - increaseCount - decreaseCount - scaleUpCount - scaleDownCount - assignCount - makeTrueCount - makeFalseCount;

                if (rest) {
                    decorationText.push(`${rest}?`);
                    hoverText.push(`${rest}x unrecognized`);
                }

                return this.decorateSymbol(editor, decorationText.join(' '), hoverText.join('\n\n'),
                    symbolInfo.location.range, { relativePosition: DecorationRelativePosition.After, margin: true});
            }

        }

        return undefined;
    }

    async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
        if (token.isCancellationRequested) { return undefined; }
        await this.symbolUtils.assertFileParsed(document);

        const symbolInfo = this.symbolUtils.getSymbolInfo(document, position);

        if (symbolInfo instanceof VariableInfo) {
            const references = this.symbolUtils.findSymbolReferences(document, symbolInfo, false);
            const pddlFileInfo = this.pddlWorkspace.getFileInfo(document);
            if (!pddlFileInfo) { return undefined; }
            const domainInfo = this.pddlWorkspace.pddlWorkspace.asDomain(pddlFileInfo);

            if (references !== undefined && domainInfo !== undefined) {
                const referenceInfos = this.getReferences(references, domainInfo, symbolInfo, document);

                const documentation = this.createReferenceDocumentation(referenceInfos);

                return new Hover(documentation, symbolInfo.hover.range);
            }
            else {
                return undefined;
            }

        } else {
            return undefined;
        }
    }


    private getReferences(references: Location[], domainInfo: DomainInfo, symbolInfo: SymbolInfo, document: TextDocument): VariableReferenceInfo[] {
        return references
            .filter(r => r.uri.toString() === domainInfo.fileUri.toString()) // limit this to the domain file only
            .map(r => new ModelHierarchy(domainInfo).getReferenceInfo((symbolInfo as VariableInfo).variable, document.offsetAt(r.range.start) + 1));
    }

    private createReferenceDocumentation(referenceInfos: VariableReferenceInfo[]): MarkdownString {
        const documentation = new MarkdownString(`**References**\n`);

        this.addAccessKindDocumentation(documentation, referenceInfos, 'Read', VariableReferenceKind.READ);
        this.addAccessKindDocumentation(documentation, referenceInfos, 'Write', VariableReferenceKind.WRITE);
        this.addAccessKindDocumentation(documentation, referenceInfos, 'Read or write', VariableReferenceKind.READ_OR_WRITE);
        this.addAccessKindDocumentation(documentation, referenceInfos, 'Unrecognized', VariableReferenceKind.UNRECOGNIZED);

        if (referenceInfos.length === 0) {
            documentation.appendText('\nNo references.');
        }

        return documentation;
    }

    private addAccessKindDocumentation(documentation: MarkdownString, referenceInfos: VariableReferenceInfo[], label: string, kind: VariableReferenceKind): void {
        const accessReferences = referenceInfos.filter(ri => ri.kind === kind);
        if (accessReferences.length > 0) {
            documentation.appendText('\n' + label + ' access:\n');
            this.createAccessKindDocumentation(accessReferences, documentation);
        }
    }

    private createAccessKindDocumentation(referenceInfos: VariableReferenceInfo[], documentation: MarkdownString): void {
        referenceInfos.forEach(ri => documentation.appendMarkdown(`\n- \`${ri.structure.getNameOrEmpty()}\` ${ri.getTimeQualifier()} ${ri.part}`).appendCodeblock(ri.relevantCode ?? '', PDDL));
    }
}