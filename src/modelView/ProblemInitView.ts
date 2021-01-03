/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri,
    ExtensionContext, TextDocument, CodeLens, CancellationToken, CodeLensProvider
} from 'vscode';

import {
    DomainInfo, ProblemInfo, TimedVariableValue,
    Variable, ObjectInstance, Parameter, Term,
    parser, utils
} from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { nodeToRange } from '../utils';
import { getObjectsInheritingFrom, getTypesInheritingFromPlusSelf } from 'pddl-workspace';
import { DocumentCodeLens, DocumentInsetCodeLens } from './view';
import { ProblemView, ProblemRenderer, ProblemRendererOptions } from './ProblemView';
import { GraphViewData, NetworkEdge, NetworkNode } from './GraphViewData';

const CONTENT = path.join('views', 'modelView');

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
                    Uri.file(context.asAbsolutePath("views"))
                ]
            }
        },
            { displayWidth: 100 }
        );
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[] | null> {
        if (token.isCancellationRequested) { return null; }
        const problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        const defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        const initNode = defineNode.getFirstChild(parser.PddlTokenType.OpenBracketOperator, /\s*:init/i);
        if (initNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, initNode))
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
            codeLens.command = { command: PDDL_PROBLEM_INIT_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }
        else {
            codeLens.command = { command: PDDL_PROBLEM_INIT_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
            return codeLens;
        }
    }

    protected createPreviewPanelTitle(uri: Uri): string {
        return `:init of '${path.basename(uri.fsPath)}'`;
    }
}

class ProblemInitRenderer implements ProblemRenderer<ProblemInitViewOptions, ProblemInitViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemInitViewOptions): ProblemInitViewData {
        const renderer = new ProblemInitRendererDelegate(context, domain, problem, options);

        return {
            symmetricRelationshipGraph: {
                nodes: renderer.getNodes(),
                relationships: renderer.getRelationships()
            },
            typeProperties: utils.serializationUtils.asSerializable(renderer.getTypeProperties()),
            typeRelationships: utils.serializationUtils.asSerializable(renderer.getTypeRelationships()),
            scalarValues: utils.serializationUtils.asSerializable(renderer.getScalarValues())
        };
    }
}

interface ProblemInitViewData {
    symmetricRelationshipGraph: GraphViewData;
    typeProperties: Map<string, TypeProperties>;
    typeRelationships: TypesRelationship[];
    scalarValues: Map<string, number | boolean>;
}

interface TypeProperties {
    propertyNames: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    objects: Map<string, Map<string, any>>;
}

interface TypesRelationship {
    types: Map<string, string[]>;
    relationships: Map<string, RelationshipValue[]>;
}

interface RelationshipValue {
    parameters: Map<string, string>;
    value?: boolean | number;
}

class ProblemInitRendererDelegate {

    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];
    private typeProperties: Map<string, TypeProperties> = new Map();
    private typeRelationships = new Array<TypesRelationship>();
    private scalarValues = new Map<string, boolean | number | string>();

    constructor(_context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, private options: ProblemInitViewOptions) {
        if (!options.hide2dGraph) {
            this.construct2dGraphData();
        }
        if (!options.hideScalarValues) {
            this.constructScalarValues();
        }
        if (!options.hideObjectProperties) {
            this.constructObjectProperties();
        }
        if (!options.hideObjectRelationships) {
            this.constructObjectRelationships();
        }
    }

    private constructScalarValues(): void {
        const scalarVariables = this.domain.getPredicates().concat(this.domain.getFunctions())
            .filter(v => v.parameters.length === 0);

        const scalarInits: VariableInitialValueTuple[] = scalarVariables
            .map(v => this.toVariableInitialValueTuple(v));

        scalarInits.forEach(init => this.addScalar(init));
    }

    private toVariableInitialValueTuple(v: Variable): VariableInitialValueTuple {
        return { variable: v, value: this.getInitValue(v) };
    }

    private addScalar(initValue: VariableInitialValueTuple): void {
        const variableName = initValue.variable.getFullName();
        if (!this.scalarValues.has(variableName)) { // this is where we are throwing away TILs/TIFs
            this.scalarValues.set(variableName,
                initValue.value?.getValue() !== undefined ? initValue.value?.getValue() : "undefined");
        }
    }

    private construct2dGraphData(): void {
        const symmetric2dPredicates = this.domain.getPredicates()
            .filter(v => this.is2DGraphable(v));
        const symmetric2dFunctions = this.domain.getFunctions()
            .filter(v => this.is2DGraphable(v));
        const symmetric2dVariables = symmetric2dFunctions.concat(symmetric2dPredicates);

        const relatableTypes: string[] = utils.Util.distinct(
            utils.Util.flatMap(symmetric2dVariables
                .map(v => [v.parameters[0].type, v.parameters[1].type])
            )
        );

        const relatableAndInheritedTypes = utils.Util.distinct(utils.Util.flatMap(relatableTypes.map(type => getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance()))));
        relatableAndInheritedTypes.forEach(type => this.getObjects(type).forEach(obj => this.addNode(obj)));

        const symmetric2dInits = this.problem.getInits()
            .filter(init => init.isSupported)
            .filter(init => symmetric2dVariables.some(v => v.matchesShortNameCaseInsensitive(init.getLiftedVariableName())));

        symmetric2dInits.forEach(init => this.addRelationship(init));
    }

    private is2DGraphable(v: Variable): unknown {
        return ProblemInitRendererDelegate.is2D(v) &&
            (!this.options.graph2dSymmetricOnly || ProblemInitRendererDelegate.is2DSymmetric(v));
    }

    private constructObjectProperties(): void {
        this.domain.getTypes().forEach(type => this.constructTypeProperties(type));
    }

    private constructTypeProperties(type: string): void {
        const typeObjects = this.domain.getConstants().merge(this.problem.getObjectsTypeMap()).getTypeCaseInsensitive(type);
        if (!typeObjects) { return; }
        const objects = typeObjects.getObjects();

        if (objects.length > 0) {
            const typeDetails = this.constructObjectsProperties(type, objects);
            if (typeDetails.propertyNames.length) {
                this.typeProperties.set(type, typeDetails);
            }
        }
    }

    private constructObjectsProperties(type: string, objects: string[]): TypeProperties {
        const liftedVariables = this.domain.getPredicates().concat(this.domain.getFunctions())
            .filter(variable => this.isTypeProperty(type, variable));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objectsValues = new Map<string, Map<string, any>>();
        objects.forEach(objectName => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const objectValues = new Map<string, any>();
            liftedVariables.forEach(v => {
                const value = this.getInitValue(v.bind([new ObjectInstance(objectName, type)]));
                if (value) {
                    objectValues.set(v.name, value.getValue());
                }
            });
            objectsValues.set(objectName, objectValues);
        });
        return {
            propertyNames: liftedVariables.map(v => v.name),
            objects: objectsValues
        };
    }

    private getInitValue(groundedVariable: Variable): TimedVariableValue | undefined {
        const firstInit = this.problem.getInits()
            .filter(init => init.isSupported)
            .filter(viv => viv.getVariableName().toLowerCase() === groundedVariable.getFullName().toLowerCase())
            .sort(viv => viv.getTime())
            .find(() => true);

        // todo: do not ignore viv.getTime()

        return firstInit;
    }

    private isTypeProperty(type: string, variable: Variable): boolean {
        const applicableTypes = getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance());
        return variable.parameters.length === 1
            && applicableTypes.includes(variable.parameters[0].type);
    }

    getScalarValues(): Map<string, boolean | number | string> {
        return this.scalarValues;
    }

    getTypeProperties(): Map<string, TypeProperties> {
        return this.typeProperties;
    }

    getTypeRelationships(): TypesRelationship[] {
        return this.typeRelationships;
    }

    private constructObjectRelationships(): void {
        const binaryRelationships = this.domain.getPredicates().concat(this.domain.getFunctions())
            .filter(v => v.parameters.length === 2);

        const relationshipPerTypes = utils.Util.groupBy(binaryRelationships, r => r.parameters.map(p => p.type).join(','));

        relationshipPerTypes
            .forEach((relationships, typeNames) =>
                this.constructTypesRelationships(typeNames.split(','), relationships));
    }

    private constructTypesRelationships(types: string[], relationships: Variable[]): void {
        const typeObjectsMap = new Map<string, string[]>();
        types.forEach(t => typeObjectsMap.set(t, this.getObjects(t)));

        const relationshipsMap = new Map<string, RelationshipValue[]>();
        relationships.forEach(r => relationshipsMap.set(r.name, this.createTypeRelationships(r)));

        this.typeRelationships.push({
            types: typeObjectsMap,
            relationships: relationshipsMap
        });
    }

    private createTypeRelationships(relationship: Variable): RelationshipValue[] {
        const applicableInits = this.problem.getInits()
            .filter(init => relationship.matchesShortNameCaseInsensitive(init.getLiftedVariableName()));

        return applicableInits.map(init => this.createRelationshipValue(init));
    }

    private createRelationshipValue(init: TimedVariableValue): RelationshipValue {
        const parameters = new Map<string, string>();
        const liftedVariable = this.domain.getPredicates().concat(this.domain.getFunctions())
            .find(v => v.name.toLowerCase() === init.getLiftedVariableName().toLowerCase());

        if (liftedVariable) {
            liftedVariable.parameters
                .forEach((term: Term, index) =>
                    parameters.set((term as Parameter).name, init.getVariableName().split(' ')[index + 1]));
        }
        else {
            init.getVariableName().split(' ').slice(1)
                .forEach((term, index) => parameters.set(index.toString(), term));
        }

        return {
            parameters: parameters,
            value: init.getValue()
        };
    }

    private getObjects(type: string): string[] {
        return getObjectsInheritingFrom(this.domain.getConstants().merge(this.problem.getObjectsTypeMap()),
            type,
            this.domain.getTypeInheritance());
    }

    private addNode(obj: string): void {
        if (!this.nodes.has(obj)) { this.nodes.set(obj, this.nodes.size + 1); }
    }

    private addRelationship(initialValue: TimedVariableValue): void {
        const edge = this.toEdge(initialValue);
        if (edge) {
            this.relationships.push(edge);
        }
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    private toNode(entry: [string, number]): NetworkNode {
        const [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    private toEdge(initialValue: TimedVariableValue): NetworkEdge | null {
        const variableNameParts = initialValue.getVariableName().split(' ');
        const fromName = variableNameParts[1];
        const toName = variableNameParts[2];
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
        const fromId = this.nodes.get(fromName);
        const toId = this.nodes.get(toName);
        if (fromId !== undefined && toId !== undefined) {
            return { from: fromId, to: toId, label: label };
        }
        else {
            console.log(`One or more nodes not found: ${fromName}, ${toName}`);
            return null;
        }
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }

    /**
     * Tests whether the predicate/function has two parameters of the same type.
     * @param variable predicate/function to test
     */
    static is2DSymmetric(variable: Variable): unknown {
        return ProblemInitRendererDelegate.is2D(variable)
            && variable.parameters[0].type === variable.parameters[1].type;
    }

    private static is2D(variable: Variable): boolean {
        return variable.parameters.length >= 2;
    }
}

interface ProblemInitViewOptions extends ProblemRendererOptions {
    hideScalarValues?: boolean;
    graph2dSymmetricOnly?: boolean;
    hide2dGraph?: boolean;
    hideObjectProperties?: boolean;
    hideObjectRelationships?: boolean;
}

interface VariableInitialValueTuple {
    variable: Variable;
    value: TimedVariableValue | undefined;
}