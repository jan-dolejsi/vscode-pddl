/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri,
    ExtensionContext, TextDocument, CodeLens, CancellationToken, CodeLensProvider
} from 'vscode';

import { DomainInfo, TypeObjects } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange } from '../utils';
import { getObjectsInheritingFrom } from '../../../common/src/typeInheritance';
import { ProblemRenderer } from './view';
import { ProblemView, ProblemRendererOptions, DocumentInsetCodeLens, DocumentCodeLens } from './ProblemView';

const CONTENT = 'problemView';

const PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND = "pddl.problem.objects.preview";
const PDDL_PROBLEM_OBJECTS_INSET_COMMAND = "pddl.problem.objects.inset";

export class ProblemObjectsView extends ProblemView<ProblemObjectsRendererOptions, ProblemObjectsViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new ProblemObjectsRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND,
            insetViewCommand: PDDL_PROBLEM_OBJECTS_INSET_COMMAND,
            insetHeight: 5,
            webviewType: 'problemObjectsPreview',
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
        let problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        let defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        let objectsNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\s*:objects/i);
        this.subscribe(document);
        return [
            new DocumentCodeLens(document, nodeToRange(document, objectsNode)),
            new DocumentInsetCodeLens(document, nodeToRange(document, objectsNode), document.positionAt(objectsNode.getStart()).line)
        ];
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return null;
        }
        if (token.isCancellationRequested) { return null; }
        let [domain] = await this.getProblemAndDomain(codeLens.getDocument());
        if (!domain) { return null; }
        if (token.isCancellationRequested) { return null; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_PROBLEM_OBJECTS_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_PROBLEM_OBJECTS_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(doc: TextDocument) {
        return `:objects of '${path.basename(doc.uri.fsPath)}'`;
    }
}

class ProblemObjectsRenderer implements ProblemRenderer<ProblemObjectsRendererOptions, ProblemObjectsViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemObjectsRendererOptions): ProblemObjectsViewData {
        let renderer = new ProblemObjectsRendererDelegate(context, domain, problem, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

interface ProblemObjectsViewData {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

class ProblemObjectsRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(_context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, _options: ProblemObjectsRendererOptions) {
        domain.getTypes().forEach((t, index) => this.nodes.set(t, index));
        domain.getTypeInheritance().getEdges().forEach(edge => this.addEdge(edge));
    }

    getObjects(type: string) {
        return getObjectsInheritingFrom(
            TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType()),
            type,
            this.domain.getTypeInheritance());
    }

    // private addNode(obj: string): void {
    //     if (!this.nodes.has(obj)) { this.nodes.set(obj, this.nodes.size + 1); }
    // }

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

interface ProblemObjectsRendererOptions extends ProblemRendererOptions {
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
