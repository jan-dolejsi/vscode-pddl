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

const CONTENT = 'modelView';

const PDDL_DOMAIN_TYPES_PREVIEW_COMMAND = "pddl.domain.types.preview";
const PDDL_DOMAIN_TYPES_INSET_COMMAND = "pddl.domain.types.inset";

export class DomainTypesView extends DomainView<DomainTypesRendererOptions, DomainTypesViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new DomainTypesRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_DOMAIN_TYPES_PREVIEW_COMMAND,
            insetViewCommand: PDDL_DOMAIN_TYPES_INSET_COMMAND,
            insetHeight: 5,
            webviewType: 'domainTypesPreview',
            webviewHtmlPath: 'problemObjectsView.html',
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
        let typesNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\s*:types/i);
        return [
            new DocumentCodeLens(document, nodeToRange(document, typesNode)),
            new DocumentInsetCodeLens(document, nodeToRange(document, typesNode), document.positionAt(typesNode.getStart()).line)
        ];
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
        return `:types of '${path.basename(uri.fsPath)}'`;
    }
}

class DomainTypesRenderer implements DomainRenderer<DomainTypesRendererOptions, DomainTypesViewData> {
    render(context: ExtensionContext, domain: DomainInfo, options: DomainTypesRendererOptions): DomainTypesViewData {
        let renderer = new DomainTypesRendererDelegate(context, domain, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

interface DomainTypesViewData {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

class DomainTypesRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(_context: ExtensionContext, domain: DomainInfo, _options: DomainTypesRendererOptions) {
        domain.getTypes().forEach((t, index) => this.nodes.set(t, index));
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

interface NetworkNode {
    id: number;
    label: string;
}

interface NetworkEdge {
    from: number;
    to: number;
    label: string;
} 
