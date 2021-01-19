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
import { ProblemInfo } from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { parser } from 'pddl-workspace';
import { nodeToRange } from '../utils';
import { DocumentInsetCodeLens, DocumentCodeLens } from './view';
import { ProblemView, ProblemRendererOptions, ProblemRenderer } from './ProblemView';
import { GraphViewData, NetworkEdge, NetworkNode } from './model';
import { NamedConditionConstraint, AfterConstraint, StrictlyAfterConstraint } from 'pddl-workspace';
import { ProblemViewPanel } from './ProblemViewPanel';

const CONTENT = path.join('views', 'modelView', 'static');

const PDDL_PROBLEM_CONSTRAINTS_PREVIEW_COMMAND = "pddl.problem.constraints.preview";
const PDDL_PROBLEM_CONSTRAINTS_INSET_COMMAND = "pddl.problem.constraints.inset";

export class ProblemConstraintsView extends ProblemView<ProblemConstraintsRendererOptions, GraphViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new ProblemConstraintsRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_PROBLEM_CONSTRAINTS_PREVIEW_COMMAND,
            insetViewCommand: PDDL_PROBLEM_CONSTRAINTS_INSET_COMMAND,
            insetHeight: 5,
            webviewType: 'problemConstraintsPreview',
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

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[] | undefined> {
        if (token.isCancellationRequested) { return undefined; }
        const problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return undefined; }
        if (!problem) { return []; }

        const defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        const constraintsNode = defineNode.getFirstChild(parser.PddlTokenType.OpenBracketOperator, /\s*:constraints/i);
        if (constraintsNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, constraintsNode)),
                new DocumentInsetCodeLens(document, nodeToRange(document, constraintsNode), document.positionAt(constraintsNode.getStart()).line)
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
        const domainAndProblem = await this.getProblemAndDomain(codeLens.getDocument());
        if (!domainAndProblem) { return undefined; }
        if (token.isCancellationRequested) { return undefined; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_PROBLEM_CONSTRAINTS_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_PROBLEM_CONSTRAINTS_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri): string {
        return `:constraints of '${path.basename(uri.fsPath)}'`;
    }

    protected async handleOnLoad(panel: ProblemViewPanel): Promise<boolean> {
        await panel.postMessage('setOptions', {
            "layout": {
                "hierarchical": {
                    "enabled": true,
                    "levelSeparation": 50,
                    "treeSpacing": 300,
                    "sortMethod": "directed"
                }
            },
        });
        return super.handleOnLoad(panel);
    }
}

class ProblemConstraintsRenderer implements ProblemRenderer<ProblemConstraintsRendererOptions, GraphViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemConstraintsRendererOptions): GraphViewData {
        const renderer = new ProblemConstraintsRendererDelegate(context, domain, problem, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

class NamedConditionNode {
    constructor(readonly id: number, readonly name: string, readonly definition: string) { }
}

class ProblemConstraintsRendererDelegate {
    private nodes: Map<string, NamedConditionNode> = new Map();
    private relationships: NetworkEdge[] = [];
    private namedConditionConstraints: NamedConditionConstraint[];
    private afterConstraints: AfterConstraint[];
    private lastNodeIndex: number;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, _options: ProblemConstraintsRendererOptions) {
        const allConstraints = this.domain.getConstraints().concat(this.problem.getConstraints());

        this.namedConditionConstraints = allConstraints
            .filter(c => c instanceof NamedConditionConstraint)
            .map(c => c as NamedConditionConstraint);

        this.afterConstraints = allConstraints
            .filter(c => c instanceof AfterConstraint)
            .map(c => c as AfterConstraint);

        this.namedConditionConstraints
            .forEach((c, index) => this.addNamedCondition(c, index));

        this.lastNodeIndex = this.namedConditionConstraints.length;

        this.afterConstraints.forEach(ac => {
            const predecessorId = this.upsertGoal(ac.predecessor);
            const successorId = this.upsertGoal(ac.successor);
            const label = ac instanceof StrictlyAfterConstraint ? 'strictly-after' : 'after';
            this.addEdge(predecessorId, successorId, label);
        });

        this.addTetheredGoal();
    }

    private addNamedCondition(namedCondition: NamedConditionConstraint, index: number): number {
        const key = namedCondition.name ?? namedCondition.condition?.getText() ?? "unnamed";
        this.nodes.set(key, new NamedConditionNode(index, namedCondition.name ?? "", namedCondition.condition?.getText() ?? "unspecified condition"));
        return index;
    }

    private upsertGoal(namedCondition: NamedConditionConstraint): number {
        if (namedCondition.name) {
            const detail = this.nodes.get(namedCondition.name);
            if (detail) {
                return detail.id;
            }
            else {
                // this happens when the model is incomplete
                return this.addNamedCondition(namedCondition, this.lastNodeIndex++);
            }
        }
        else if (namedCondition.condition) {
            const conditionText = namedCondition.condition.getText();
            if (this.nodes.has(conditionText)) {
                return this.nodes.get(conditionText)!.id;
            }
            else {
                return this.addNamedCondition(namedCondition, this.lastNodeIndex++);
            }
        }
        else {
            throw new Error('Unexpected constraint: ' + namedCondition.toString());
        }
    }

    addTetheredGoal(): void {
        const pattern = /\((start|end)\s+of\s*(.+)\s*\)/i;
        [...this.nodes.keys()].forEach(nodeStartName => {
            const matchStart = pattern.exec(nodeStartName);
            if (matchStart) {
                if (matchStart[1] === "start") {
                    const actionName = matchStart[2];

                    [...this.nodes.keys()].find(nodeEndName => {
                        const matchEnd = pattern.exec(nodeEndName);
                        if (matchEnd &&
                            matchEnd[1] === "end" &&
                            matchEnd[2] === actionName) {
                            const startNode = this.nodes.get(nodeStartName);
                            const endNode = this.nodes.get(nodeEndName);
                            if (startNode && endNode) {
                                this.addEdge(startNode.id, endNode.id, "durative-action");
                            }
                        }
                    });
                    }
            }
        });
    }

    private addEdge(predecessorId: number, successorId: number, label: string): void {
        this.relationships.push({ from: predecessorId, to: successorId, label: label });
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.values()].map(entry => this.toNode(entry));
    }

    private toNode(entry: NamedConditionNode): NetworkNode {
        const shape = "box";
        // concatenate the name and definition if both are provided
        const label = [entry.name, entry.definition]
            .filter(element => element && element.length > 0)
            .join(': ');
        return { id: entry.id, label: label, shape: shape };
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ProblemConstraintsRendererOptions extends ProblemRendererOptions {
}
