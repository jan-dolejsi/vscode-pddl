/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri,
    ExtensionContext, TextDocument, CodeLens, CancellationToken, CodeLensProvider
} from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange } from '../utils';
import { DocumentInsetCodeLens, DocumentCodeLens } from './view';
import { DomainView, DomainRendererOptions, DomainRenderer } from './DomainView';
import { GraphViewData, NetworkEdge, NetworkNode } from './GraphViewData';
import { DomainViewPanel } from './DomainViewPanel';

const CONTENT = path.join('views', 'modelView');

const PDDL_DOMAIN_TYPES_PREVIEW_COMMAND = "pddl.domain.types.preview";
const PDDL_DOMAIN_TYPES_INSET_COMMAND = "pddl.domain.types.inset";

export class DomainTypesView extends DomainView<DomainTypesRendererOptions, GraphViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new DomainTypesRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_DOMAIN_TYPES_PREVIEW_COMMAND,
            insetViewCommand: PDDL_DOMAIN_TYPES_INSET_COMMAND,
            insetHeight: 5,
            webviewType: 'domainTypesPreview',
            webviewHtmlPath: 'graphView.html',
            webviewOptions: {
                enableFindWidget: true,
                // enableCommandUris: true,
                retainContextWhenHidden: true,
                enableScripts: true,
                localResourceRoots: [
                    Uri.file(context.extensionPath)
                ]
            }
        },
            {  }
        );
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) { return null; }
        let domain = await this.parseDomain(document);
        if (token.isCancellationRequested) { return null; }
        if (!domain) { return []; }

        let defineNode = domain.syntaxTree.getDefineNodeOrThrow();
        let typesNode = defineNode.getFirstChild(PddlTokenType.OpenBracketOperator, /\s*:types/i);
        if (typesNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, typesNode))
            ];
        }
        else {
            return [];
        }
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return null;
        }
        if (token.isCancellationRequested) { return null; }
        let domain = await this.parseDomain(codeLens.getDocument());
        if (!domain) { return null; }
        if (token.isCancellationRequested) { return null; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_DOMAIN_TYPES_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_DOMAIN_TYPES_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri) {
        return `:types in '${path.basename(uri.fsPath)}'`;
    }

    protected async handleOnLoad(panel: DomainViewPanel): Promise<boolean> {
        await panel.postMessage('setInverted', { value: true });
        return super.handleOnLoad(panel);
    }
}

class DomainTypesRenderer implements DomainRenderer<DomainTypesRendererOptions, GraphViewData> {
    render(context: ExtensionContext, domain: DomainInfo, options: DomainTypesRendererOptions): GraphViewData {
        let renderer = new DomainTypesRendererDelegate(context, domain, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

class DomainTypesRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(_context: ExtensionContext, domain: DomainInfo, _options: DomainTypesRendererOptions) {
        domain.getTypesInclObject().forEach((t, index) => this.nodes.set(t, index));
        domain.getTypeInheritance().getEdges().forEach(edge => this.addEdge(edge));
    }

    addEdge(edge: [string, string]): void {
        this.relationships.push(this.toEdge(edge));
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    toNode(entry: [string, number]): NetworkNode {
        let [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    toEdge(edge: [string, string]): NetworkEdge {
        let [from, to] = edge;
        return { from: this.nodes.get(from), to: this.nodes.get(to), label: 'extends' };
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }
}

interface DomainTypesRendererOptions extends DomainRendererOptions {
}
