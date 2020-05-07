/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri,
    ExtensionContext, TextDocument, CodeLens, CancellationToken, CodeLensProvider
} from 'vscode';

import { DomainInfo } from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { parser } from 'pddl-workspace';
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
                    Uri.file(context.asAbsolutePath("views"))
                ]
            }
        },
            {  }
        );
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[] | undefined> {
        if (token.isCancellationRequested) { return undefined; }
        const domain = await this.parseDomain(document);
        if (token.isCancellationRequested) { return undefined; }
        if (!domain) { return []; }

        const defineNode = domain.syntaxTree.getDefineNodeOrThrow();
        const typesNode = defineNode.getFirstChild(parser.PddlTokenType.OpenBracketOperator, /\s*:types/i);
        if (typesNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, typesNode))
            ];
        }
        else {
            return [];
        }
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens | undefined> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return undefined;
        }
        if (token.isCancellationRequested) { return undefined; }
        const domain = await this.parseDomain(codeLens.getDocument());
        if (!domain) { return undefined; }
        if (token.isCancellationRequested) { return undefined; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_DOMAIN_TYPES_INSET_COMMAND, title: 'Show hierarchy inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_DOMAIN_TYPES_PREVIEW_COMMAND, title: 'Show hierarchy', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri): string {
        return `:types in '${path.basename(uri.fsPath)}'`;
    }

    protected async handleOnLoad(panel: DomainViewPanel): Promise<boolean> {
        await panel.postMessage('setInverted', { value: true });
        return super.handleOnLoad(panel);
    }
}

class DomainTypesRenderer implements DomainRenderer<DomainTypesRendererOptions, GraphViewData> {
    render(context: ExtensionContext, domain: DomainInfo, options: DomainTypesRendererOptions): GraphViewData {
        const renderer = new DomainTypesRendererDelegate(context, domain, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

class DomainTypesRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        const [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    toEdge(edge: [string, string]): NetworkEdge {
        const [from, to] = edge;
        return { from: this.getNodeId(from), to: this.getNodeId(to) , label: 'extends' };
    }

    private getNodeId(from: string): number {
        const nodeId = this.nodes.get(from);
        if (nodeId === undefined) {
            return -1;
        } else {
            return nodeId;
        }
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface DomainTypesRendererOptions extends DomainRendererOptions {
}
