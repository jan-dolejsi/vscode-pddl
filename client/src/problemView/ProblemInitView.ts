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
import { ProblemInfo, TimedVariableValue } from '../../../common/src/ProblemInfo';
import { Variable } from '../../../common/src/FileInfo';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange } from '../utils';
import { getObjectsInheritingFrom, getTypesInheritingFromPlusSelf } from '../../../common/src/typeInheritance';
import { Util } from '../../../common/src/util';
import { ProblemRenderer } from './view';
import { ProblemView, DocumentCodeLens, DocumentInsetCodeLens, ProblemRendererOptions } from './ProblemView';

const CONTENT = 'problemView';

const PDDL_PROBLEM_INIT_PREVIEW_COMMAND = "pddl.problem.init.preview";
const PDDL_PROBLEM_INIT_INSET_COMMAND = "pddl.problem.init.inset";
const DEFAULT_INSET_HEIGHT = 10;

export class ProblemInitView extends ProblemView<ProblemInitViewOptions, ProblemInitViewData> implements CodeLensProvider {

    constructor(context: ExtensionContext, codePddlWorkspace: CodePddlWorkspace) {
        super(context, codePddlWorkspace, new ProblemInitRenderer(), {
            content: CONTENT,
            viewCommand: PDDL_PROBLEM_INIT_PREVIEW_COMMAND,
            insetViewCommand: PDDL_PROBLEM_INIT_INSET_COMMAND,
            insetHeight: DEFAULT_INSET_HEIGHT,
            webviewType: 'problemPreview',
            webviewHtmlPath: 'problemInitView.html',
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
            { displayWidth: 100 }
        );
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) { return null; }
        let problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        let defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        let initNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\s*:init/i);
        return [
            new DocumentCodeLens(document, nodeToRange(document, initNode)),
            new DocumentInsetCodeLens(document, nodeToRange(document, initNode), document.positionAt(initNode.getStart()).line)
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
            codeLens.command = { command: PDDL_PROBLEM_INIT_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_PROBLEM_INIT_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri) {
        return `:init of '${path.basename(uri.fsPath)}'`;
    }
}

class ProblemInitRenderer implements ProblemRenderer<ProblemInitViewOptions, ProblemInitViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemInitViewOptions): ProblemInitViewData {
        let renderer = new ProblemInitRendererDelegate(context, domain, problem, options);

        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

interface ProblemInitViewData {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

class ProblemInitRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(private context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, private options: ProblemInitViewOptions) {
        console.log(`${this.context}, ${this.options}`);
        let symmetric2dPredicates = domain.getPredicates()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));

        let symmetric2dFunctions = domain.getFunctions()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));

        let symmetric2dVariables = symmetric2dFunctions.concat(symmetric2dPredicates);

        let relatableTypes: string[] = Util.distinct(symmetric2dVariables
            .map(v => v.parameters[0].type));

        let relatableAndInheritedTypes = Util.distinct(Util.flatMap(relatableTypes.map(type => getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance()))));

        relatableAndInheritedTypes.forEach(type => this.getObjects(type).forEach(obj => this.addNode(obj)));

        let symmetric2dInits = problem.getInits()
            .filter(init => symmetric2dVariables.some(v => v.matchesShortNameCaseInsensitive(init.getLiftedVariableName())));

        symmetric2dInits.forEach(init => this.addRelationship(init));
    }

    getObjects(type: string) {
        return getObjectsInheritingFrom(
            TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType()),
            type,
            this.domain.getTypeInheritance());
    }

    private addNode(obj: string): void {
        if (!this.nodes.has(obj)) { this.nodes.set(obj, this.nodes.size + 1); }
    }

    addRelationship(initialValue: TimedVariableValue): void {
        this.relationships.push(this.toEdge(initialValue));
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    toNode(entry: [string, number]): NetworkNode {
        let [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    toEdge(initialValue: TimedVariableValue): NetworkEdge {
        let variableNameParts = initialValue.getVariableName().split(' ');
        let fromName = variableNameParts[1];
        let toName = variableNameParts[2];
        let label = variableNameParts[0];

        if (variableNameParts.length > 3) {
            // the variable had more than 2 parameters
            label += ' ' + variableNameParts.slice(3).join(' ');
        }
        if (!(initialValue.getValue() === true)) {
            // this is a fluent! include the value
            label += `=${initialValue.getValue()}`;
        }
        if (initialValue.getTime() > 0) {
            // this is a timed-initial literal/fluent
            label += ' @ ' + initialValue.getTime();
        }
        return { from: this.nodes.get(fromName), to: this.nodes.get(toName), label: label };
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }

    /**
     * Tests whether the predicate/function has two parameters of the same type.
     * @param variable predicate/function to test
     */
    static is2DSymmetric(variable: Variable): unknown {
        return variable.parameters.length >= 2
            && variable.parameters[0].type === variable.parameters[1].type;
    }
}

interface ProblemInitViewOptions extends ProblemRendererOptions {
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
