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
import { Variable, ObjectInstance, Parameter } from '../../../common/src/FileInfo';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange, asSerializable } from '../utils';
import { getObjectsInheritingFrom, getTypesInheritingFromPlusSelf } from '../../../common/src/typeInheritance';
import { Util } from '../../../common/src/util';
import { DocumentCodeLens, DocumentInsetCodeLens } from './view';
import { ProblemView, ProblemRenderer, ProblemRendererOptions } from './ProblemView';

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
        let initNode = defineNode.getFirstChild(PddlTokenType.OpenBracketOperator, /\s*:init/i);
        if (initNode) {
            return [
                new DocumentCodeLens(document, nodeToRange(document, initNode))
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
            symmetricRelationshipGraph: {
                nodes: renderer.getNodes(),
                relationships: renderer.getRelationships()
            },
            typeProperties: asSerializable(renderer.getTypeProperties()),
            typeRelationships: asSerializable(renderer.getTypeRelationships())
        };
    }
}

interface ProblemInitViewData {
    symmetricRelationshipGraph: SymmetricRelationshipGraph;
    typeProperties: Map<string, TypeProperties>;
    typeRelationships: TypesRelationship[];
}

interface SymmetricRelationshipGraph {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

interface TypeProperties {
    propertyNames: string[];
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

    constructor(_context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, options: ProblemInitViewOptions) {
        if (!options.hide2dGraph) {
            this.construct2dGraphData();
        }
        if (!options.hideObjectProperties) {
            this.constructObjectProperties();
        }
        if (!options.hideObjectRelationships) {
            this.constructObjectRelationships();
        }
    }

    private construct2dGraphData(): void {
        let symmetric2dPredicates = this.domain.getPredicates()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));
        let symmetric2dFunctions = this.domain.getFunctions()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));
        let symmetric2dVariables = symmetric2dFunctions.concat(symmetric2dPredicates);

        let relatableTypes: string[] = Util.distinct(symmetric2dVariables
            .map(v => v.parameters[0].type));
        let relatableAndInheritedTypes = Util.distinct(Util.flatMap(relatableTypes.map(type => getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance()))));
        relatableAndInheritedTypes.forEach(type => this.getObjects(type).forEach(obj => this.addNode(obj)));

        let symmetric2dInits = this.problem.getInits()
            .filter(init => init.isSupported)
            .filter(init => symmetric2dVariables.some(v => v.matchesShortNameCaseInsensitive(init.getLiftedVariableName())));

        symmetric2dInits.forEach(init => this.addRelationship(init));
    }

    private constructObjectProperties(): void {
        this.domain.getTypes().forEach(type => this.constructTypeProperties(type));
    }

    private constructTypeProperties(type: string): void {
        let typeObjects = TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType()).find(t => t.type === type);
        if (!typeObjects) { return; }
        let objects = typeObjects.getObjects();

        if (objects.length > 0) {
            let typeDetails = this.constructObjectsProperties(type, objects);
            if (typeDetails.propertyNames.length) {
                this.typeProperties.set(type, typeDetails);
            }
        }
    }

    private constructObjectsProperties(type: string, objects: string[]): TypeProperties {
        let liftedVariables = this.domain.getPredicates().concat(this.domain.getFunctions())
            .filter(variable => this.isTypeProperty(type, variable));

        let objectsValues = new Map<string, Map<string, any>>();
        objects.forEach(objectName => {
            let objectValues = new Map<string, any>();
            liftedVariables.forEach(v => {
                let value = this.getInitValue(v.bind([new ObjectInstance(objectName, type)]));
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

    private getInitValue(groundedVariable: Variable): TimedVariableValue  {
        let firstInit = this.problem.getInits()
            .filter(init => init.isSupported)
            .filter(viv => viv.getVariableName().toLowerCase() === groundedVariable.getFullName().toLowerCase())
            .sort(viv => viv.getTime())
            .find(_ => true);

        // todo: do not ignore viv.getTime()
        
        return firstInit;
    }

    private isTypeProperty(type: string, variable: Variable): boolean {
        let applicableTypes = getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance());
        return variable.parameters.length === 1
            && applicableTypes.includes(variable.parameters[0].type);
    }

    getTypeProperties(): Map<string, TypeProperties> {
        return this.typeProperties;
    }

    getTypeRelationships(): TypesRelationship[] {
        return this.typeRelationships;
    }

    private constructObjectRelationships(): void {
        let binaryRelationships = this.domain.getPredicates().concat(this.domain.getFunctions())
            .filter(v => v.parameters.length === 2);
        
        let relationshipPerTypes = Util.groupBy(binaryRelationships, r => r.parameters.map(p => p.type).join(','));
        
        relationshipPerTypes
            .forEach((relationships, typeNames) =>
                this.constructTypesRelationships(typeNames.split(','), relationships));
    }

    private constructTypesRelationships(types: string[], relationships: Variable[]): void {
        let typeObjectsMap = new Map<string, string[]>();
        types.forEach(t => typeObjectsMap.set(t, this.getObjects(t)));

        let relationshipsMap = new Map<string, RelationshipValue[]>();
        relationships.forEach(r => relationshipsMap.set(r.name, this.createTypeRelationships(r)));

        this.typeRelationships.push({
            types: typeObjectsMap,
            relationships: relationshipsMap 
        });
    }

    private createTypeRelationships(relationship: Variable): RelationshipValue[] {
        let applicableInits = this.problem.getInits()
            .filter(init => relationship.matchesShortNameCaseInsensitive(init.getLiftedVariableName()));
        
        return applicableInits.map(init => this.createRelationshipValue(init));
    }
    
    private createRelationshipValue(init: TimedVariableValue): RelationshipValue {
        let parameters = new Map<string, string>();
        let liftedVariable = this.domain.getPredicates().concat(this.domain.getFunctions())
            .find(v => v.name.toLowerCase() === init.getLiftedVariableName().toLowerCase());
        
        if (liftedVariable) {
            liftedVariable.parameters
                .forEach((term: Parameter, index) =>
                    parameters.set(term.name, init.getVariableName().split(' ')[index + 1]));
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
        return getObjectsInheritingFrom(
            TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType()),
            type,
            this.domain.getTypeInheritance());
    }

    private addNode(obj: string): void {
        if (!this.nodes.has(obj)) { this.nodes.set(obj, this.nodes.size + 1); }
    }

    private addRelationship(initialValue: TimedVariableValue): void {
        this.relationships.push(this.toEdge(initialValue));
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    private toNode(entry: [string, number]): NetworkNode {
        let [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    private toEdge(initialValue: TimedVariableValue): NetworkEdge {
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
    hide2dGraph?: boolean;
    hideObjectProperties?: boolean;
    hideObjectRelationships?: boolean;
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
