/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri,
    ExtensionContext, TextDocument, CodeLens, CancellationToken, CodeLensProvider
} from 'vscode';

import { DomainInfo, TypeObjectMap } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { parser } from 'pddl-workspace';
import { nodeToRange } from '../utils';
import { DocumentInsetCodeLens, DocumentCodeLens } from './view';
import { ProblemView, ProblemRendererOptions, ProblemRenderer } from './ProblemView';
import { GraphViewData, NetworkEdge, NetworkNode } from './model';
import { ProblemViewPanel } from './ProblemViewPanel';

const CONTENT = path.join('views', 'modelView', 'static');

const PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND = "pddl.problem.objects.preview";
const PDDL_PROBLEM_OBJECTS_INSET_COMMAND = "pddl.problem.objects.inset";

export class ProblemObjectsView extends ProblemView<ProblemObjectsRendererOptions, GraphViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new ProblemObjectsRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND,
            insetViewCommand: PDDL_PROBLEM_OBJECTS_INSET_COMMAND,
            insetHeight: 5,
            webviewType: 'problemObjectsPreview',
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
            {}
        );
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[] | null> {
        if (token.isCancellationRequested) { return null; }
        const problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        const defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        const objectsNode = defineNode.getFirstChild(parser.PddlTokenType.OpenBracketOperator, /\s*:objects/i);
        if (objectsNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, objectsNode))
            ];
        }
        else {
            return [];
        }
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens | null> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return null;
        }
        if (token.isCancellationRequested) { return null; }
        const domainAndProblem = await this.getProblemAndDomain(codeLens.getDocument());
        if (!domainAndProblem) { return null; }
        if (token.isCancellationRequested) { return null; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_PROBLEM_OBJECTS_INSET_COMMAND, title: 'Show hierarchy inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND, title: 'Show hierarchy', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri): string {
        return `:objects of '${path.basename(uri.fsPath)}'`;
    }

    protected async handleOnLoad(panel: ProblemViewPanel): Promise<boolean> {
        await panel.postMessage('setInverted', { value: true });
        await panel.postMessage('setOptions', {
            groups: {
                object: {
                    color: {
                        background: 'lightgreen'
                    },
                    borderWidth: 0
                }
            }
        });
        return super.handleOnLoad(panel);
    }
}

class ProblemObjectsRenderer implements ProblemRenderer<ProblemObjectsRendererOptions, GraphViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemObjectsRendererOptions): GraphViewData {
        const renderer = new ProblemObjectsRendererDelegate(context, domain, problem, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

class ProblemObjectsRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];
    private objectsAndConstantsPerType: TypeObjectMap;
    private lastIndex: number;
    private typeNames = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, _options: ProblemObjectsRendererOptions) {
        this.objectsAndConstantsPerType = this.domain.getConstants().merge(this.problem.getObjectsTypeMap());

        domain.getTypesInclObject().forEach((t, index) => {
            this.nodes.set(t, index);
            this.typeNames.add(t);
        });
        domain.getTypeInheritance().getEdges().forEach(edge => this.addEdge(edge, 'extends'));

        this.lastIndex = domain.getTypesInclObject().length;
        domain.getTypes().forEach(t => this.addObjects(t));
    }

    private addObjects(typeName: string): void {
        const objectsOfType = this.objectsAndConstantsPerType.getTypeCaseInsensitive(typeName);
        if (objectsOfType) {
            const objects = objectsOfType.getObjects();
            objects.forEach((objectName, index) => {
                this.nodes.set(objectName, index + this.lastIndex);
                this.addEdge([objectName, typeName], '');
            });

            this.lastIndex += objects.length;
        }
    }

    private addEdge(edge: [string, string], label: string): void {
        const networkEdge = this.toEdge(edge, label);
        if (networkEdge) {
            this.relationships.push(networkEdge);
        }
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    private toNode(entry: [string, number]): NetworkNode {
        const [entryLabel, entryId] = entry;
        const isType = this.typeNames.has(entryLabel);
        const shape = isType ? "ellipse" : "box";
        const group = isType ? "type" : "object";
        return { id: entryId, label: entryLabel, shape: shape, group: group };
    }

    private toEdge(edge: [string, string], label: string): NetworkEdge | null {
        const [from, to] = edge;
        const fromId = this.nodes.get(from);
        const toId = this.nodes.get(to);
        if (fromId !== undefined && toId !== undefined) {
            return { from: fromId, to: toId, label: label };
        }
        else {
            console.log(`One or more nodes not found: ${from}, ${to}`);
            return null;
        }
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ProblemObjectsRendererOptions extends ProblemRendererOptions {
}
