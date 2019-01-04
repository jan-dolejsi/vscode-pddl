/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemParserPreProcessor } from "./ProblemParserPreProcessor";
import { dirname } from "path";
import { Util } from "./util";
import { PddlExtensionContext } from "./PddlExtensionContext";
import { PlanStep } from "./PlanStep";
import { PlanBuilder } from "./PddlPlanParser";
import { DirectionalGraph } from "./DirectionalGraph";
import { HappeningsInfo, PlanHappeningsBuilder, Happening } from "./HappeningsInfo";
import { FileInfo, stripComments, Variable, Parameter, PddlRange, PddlLanguage, ParsingProblem, ObjectInstance } from "./FileInfo";
import { PreProcessingError } from "./PreProcessors";

export class Parser {

    domainPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)/gi;
    domainDetailsPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)\s*\(:requirements\s*([^\)]*)\)\s*(\(:types\s*([^\)]*)\))?\s*(\(:constants\s*([^\)]*)\))?\s*(\(:predicates\s*((\([^\)]*\)\s*)*)\))?\s*(\(:functions\s*((\([^\)]*\)\s*)*)\))?/gi;
    problemPattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)/gi;
    problemCompletePattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)\s*(\(:requirements\s*([^\)]*)\))?\s*(\(:objects\s*([^\)]*)\))?\s*\(:init\s*([\s\S]*)\s*\)\s*\(:goal\s*([\s\S]*?)\s*\)\s*(\(:constraints\s*([\s\S]*?)\s*\))?\s*(\(:metric\s*([\s\S]*?)\s*\))?\s*\)\s*$/gi;

    preProcessor: ProblemParserPreProcessor;

    constructor(context?: PddlExtensionContext) {
        this.preProcessor = new ProblemParserPreProcessor(context);
    }

    tryProblem(fileUri: string, fileVersion: number, fileText: string): ProblemInfo {
        let filePath = Util.fsPath(fileUri);
        let workingDirectory = dirname(filePath);

        try {
            fileText = this.preProcessor.process(fileText, workingDirectory);
        } catch (ex) {
            if (ex instanceof PreProcessingError) {
                let problemInfo = new ProblemInfo(fileUri, fileVersion, "unknown", "unknown");
                problemInfo.setText(fileText);
                let parsingError = <PreProcessingError>ex;
                problemInfo.addProblems([new ParsingProblem(parsingError.message, parsingError.line, parsingError.column)]);
                return problemInfo;
            }
            else{
                console.error(ex);
            }
        }

        let pddlText = stripComments(fileText);

        this.problemPattern.lastIndex = 0;
        let matchGroups = this.problemPattern.exec(pddlText);

        if (matchGroups) {
            let problemName = matchGroups[1];
            let domainName = matchGroups[2];

            let problemInfo = new ProblemInfo(fileUri, fileVersion, problemName, domainName);
            problemInfo.setText(fileText);
            this.getProblemStructure(pddlText, problemInfo);
            return problemInfo;
        }
        else {
            return null;
        }
    }

    tryDomain(fileUri: string, fileVersion: number, fileText: string): DomainInfo {

        let pddlText = stripComments(fileText);

        this.domainPattern.lastIndex = 0;
        let matchGroups = this.domainPattern.exec(pddlText);

        if (matchGroups) {
            let domainName = matchGroups[1];

            let domainInfo = new DomainInfo(fileUri, fileVersion, domainName);
            domainInfo.setText(fileText);
            this.getDomainStructure(pddlText, domainInfo);
            return domainInfo;
        }
        else {
            return null;
        }
    }

    static parsePlanMeta(fileText: string): PlanMetaData {
        let problemName = UNSPECIFIED_PROBLEM;
        let problemMatch = fileText.match(/^;;\s*!problem:\s*([\w-]+)\s*$/m);
        if (problemMatch) {
            problemName = problemMatch[1];
        }

        let domainName = UNSPECIFIED_DOMAIN;
        let domainMatch = fileText.match(/^;;\s*!domain:\s*([\w-]+)\s*$/m);
        if (domainMatch) {
            domainName = domainMatch[1];
        }

        return { domainName: domainName, problemName: problemName };
    }

    parsePlan(fileUri: string, fileVersion: number, fileText: string, epsilon: number): PlanInfo {
        let meta = Parser.parsePlanMeta(fileText);

        let planInfo = new PlanInfo(fileUri, fileVersion, meta.problemName, meta.domainName, fileText);
        let planBuilder = new PlanBuilder(epsilon);
        fileText.split('\n').forEach((planLine: string, index: number) => {
            let planStep = planBuilder.parse(planLine, index);
            if (planStep) {
                planBuilder.add(planStep);
            }
        });
        planInfo.setSteps(planBuilder.getSteps());

        return planInfo;
    }

    parseHappenings(fileUri: string, fileVersion: number, fileText: string, epsilon: number): HappeningsInfo {
        let meta = Parser.parsePlanMeta(fileText);

        let happeningsInfo = new HappeningsInfo(fileUri, fileVersion, meta.problemName, meta.domainName, fileText);
        let planBuilder = new PlanHappeningsBuilder(epsilon);
        planBuilder.tryParseFile(fileText);
        happeningsInfo.setHappenings(planBuilder.getHappenings());
        happeningsInfo.addProblems(planBuilder.getParsingProblems());
        planBuilder.validateOpenQueueIsEmpty();

        return happeningsInfo;
    }

    getDomainStructure(domainText: string, domainInfo: DomainInfo): void {
        this.domainDetailsPattern.lastIndex = 0;
        let matchGroups = this.domainDetailsPattern.exec(domainText);

        if (matchGroups) {
            let typesText = matchGroups[4];
            domainInfo.setTypeInheritance(this.parseInheritance(typesText));
            let constantsText = matchGroups[6];
            domainInfo.setConstants(Parser.toTypeObjects(this.parseInheritance(constantsText)));
            let predicatesText = matchGroups[8];
            let predicates = Parser.parsePredicatesOrFunctions(predicatesText);
            domainInfo.setPredicates(predicates);

            let functionsText = matchGroups[11];
            let functions = Parser.parsePredicatesOrFunctions(functionsText);
            domainInfo.setFunctions(functions);
        }

        domainInfo.setDerived(this.parseDerived(domainText));

        domainInfo.setActions(this.parseActions(domainText));
    }

    getProblemStructure(problemText: string, problemInfo: ProblemInfo): void {
        this.problemCompletePattern.lastIndex = 0;
        let matchGroups = this.problemCompletePattern.exec(problemText);

        if (matchGroups) {
            let objectsText = matchGroups[6];
            problemInfo.setObjects(Parser.toTypeObjects(this.parseInheritance(objectsText)));

            let initText = matchGroups[7];
            problemInfo.setInits(this.parseInit(initText));
        }
    }

    static toTypeObjects(graph: DirectionalGraph): TypeObjects[] {
        let typeSet = new Set<string>(graph.getEdges().map(edge => edge[1]));
        let typeObjects: TypeObjects[] = Array.from(typeSet).map(type => new TypeObjects(type));

        graph.getVertices().forEach(obj => {
            graph.getVerticesWithEdgesFrom(obj).forEach(type => typeObjects.find(to => to.type == type).objects.push(obj));
        });

        return typeObjects;
    }

    parseInheritance(declarationText: string): DirectionalGraph {

        // the inheritance graph is captured as a two dimensional array, where the first index is the types themselves, the second is the parent type they inherit from (PDDL supports multiple inheritance)
        let inheritance = new DirectionalGraph();

        if (!declarationText) return inheritance;

        // if there are root types that do not inherit from 'object', add the 'object' inheritance.
        // it will make the following regex work
        if (!declarationText.match(/-\s+\w[\w-]*\s*$/)) {
            declarationText += ' - object';
        }

        let pattern = /(\w[\w-]*\s+)+-\s+\w[\w-]*/g;
        let match;
        while (match = pattern.exec(declarationText)) {
            // is this a group with inheritance?
            let fragments = match[0].split(/\s-/);
            let parent = fragments.length > 1 ? fragments[1].trim() : null;
            let children = fragments[0].trim().split(/\s+/g, );

            children.forEach(childType => inheritance.addEdge(childType, parent));
        }

        return inheritance;
    }

    problemInitPattern = /(\(\s*=\s*\(([\w-]+(?: [\w-]+)*)\s*\)\s*([\d.]+)\s*\)\s*|\(([\w-]+(?: [\w-]+)*)\s*\)\s*|\(at ([\d.]+)\s*(\(\s*=\s*\(([\w-]+(?: [\w-]+)*)\s*\)\s*([\d.]+)\s*\)|\(([\w-]+(?: [\w-]+)*)\s*\)\s*\)\s*))/g;

    /**
     * Parses problem :init section.
     * @param initText init section content
     */
    parseInit(initText: string): TimedVariableValue[] {
        const variableInitValues: TimedVariableValue[] = [];
        this.problemInitPattern.lastIndex = 0;
        var match: RegExpExecArray;
        while(match = this.problemInitPattern.exec(initText)) {
            var time = 0;
            var variableName: string;
            var value: number | boolean;

            if(match[1].match(/^\s*\(at\s+[\d.]+/)) {
                // time initial...
                time = parseInt(match[5]);

                if(match[6].startsWith('(=')) {
                    // time initial fluent
                    variableName = match[7];
                    value = parseFloat(match[8]);
                } 
                else {
                    // time initial literal
                    variableName = match[9];
                    value = true;
                }
            }
            else {
                if(match[1].startsWith('(=')) {
                    // initial fluent value
                    variableName = match[2];
                    value = parseFloat(match[3]);
                } 
                else {
                    // initialiezed literal
                    variableName = match[4];
                    value = true;
                }
            }

            variableInitValues.push(new TimedVariableValue(time, variableName, value));
        }

        return variableInitValues;
    }

    static parsePredicatesOrFunctions(predicatesText: string): Variable[] {
        let pattern = /\(([^\)]*)\)/gi;
        let predicates = new Array<Variable>();

        let group: RegExpExecArray;

        while (group = pattern.exec(predicatesText)) {
            let fullSymbolName = group[1];
            let parameters = Parser.parseParameters(fullSymbolName);
            predicates.push(new Variable(fullSymbolName, parameters));
        }

        return predicates;
    }

    static parseParameters(fullSymbolName: string): Parameter[] {
        let parameterPattern = /((\?[\w]+\s+)+)-\s+([\w][\w-]*)/g;

        let parameters: Parameter[] = [];

        let group: RegExpExecArray;

        while (group = parameterPattern.exec(fullSymbolName)) {
            let variables = group[1];
            let type = group[3];

            variables.split(/(\s+)/)
                .filter(term => term.trim().length)
                .map(variable => variable.substr(1).trim()) // skip the question-mark
                .forEach(variable => parameters.push(new Parameter(variable, type)));
        }

        return parameters;
    }

    parseDerived(domainText: string): Variable[] {
        let pattern = /\(\s*:(derived)\s*\(([_\w][_\w-]*[^\)]*)\)\s(;\s(.*))?/gi;

        let derivedVariables: Variable[] = [];

        let group: RegExpExecArray;

        while (group = pattern.exec(domainText)) {
            let fullSymbolName = group[2];
            let parameters = Parser.parseParameters(fullSymbolName);
            let documentation = group[4];

            let derived = new Variable(fullSymbolName, parameters);
            if (documentation) derived.setDocumentation(documentation);
            derived.location = Parser.toRange(domainText, group.index, 0);
            derivedVariables.push(derived);
        }

        return derivedVariables;
    }

    parseActions(domainText: string): Action[] {
        let pattern = /\(\s*:(action|durative\-action)\s*([_\w][_\w-]*)\s(;\s(.*))?/gi;

        let actions: Action[] = [];

        let group: RegExpExecArray;

        while (group = pattern.exec(domainText)) {
            let actionType = group[1];
            let actionName = group[2];
            let actionDocumentation = group[4];

            let action = new Action(actionName, actionType.includes('durative'));
            action.documentation = actionDocumentation;
            action.location = Parser.toRange(domainText, group.index, 0);
            actions.push(action);
        }

        return actions;
    }

    static toRange(text: string, index: number, length: number): PddlRange {
        let lineLengths = text.split('\n').map(line => line.length + 1);

        let totalCharactersSoFar = 0;

        for (var lineIdx = 0; lineIdx < lineLengths.length; lineIdx++) {
            let lineLength = lineLengths[lineIdx];

            if (totalCharactersSoFar + lineLength > index) {
                let firstCharacterOnLine = index - totalCharactersSoFar;
                return new PddlRange(lineIdx, firstCharacterOnLine, lineIdx, firstCharacterOnLine + length);
            }

            totalCharactersSoFar += lineLength;
        }

        throw `Index ${index} is after the end of the document text.`
    }
}

/**
 * Problem file.
 */
export class ProblemInfo extends FileInfo {
    objects: TypeObjects[] = [];
    inits: TimedVariableValue[] = [];

    constructor(fileUri: string, version: number, problemName: string, public domainName: string) {
        super(fileUri, version, problemName);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    setObjects(objects: TypeObjects[]): void {
        this.objects = objects;
    }

    getObjects(type: string): string[] {
        let thisTypesObjects = this.objects.find(to => to.type == type);

        if (!thisTypesObjects) return [];
        else return thisTypesObjects.objects;
    }

    /**
     * Sets predicate/function initial values.
     * @param inits initial values
     */
    setInits(inits: TimedVariableValue[]): void {
        this.inits = inits;
    }

    /**
     * Returns variable initial values and time-initial literals/fluents. 
     */
    getInits(): TimedVariableValue[] {
        return this.inits;
    }

    isProblem(): boolean {
        return true;
    }
}

/**
 * Variable value effective from certain time, e.g. initialization of the variable in the problem file.
 */
export class TimedVariableValue {
    constructor(private time: number, private variableName: string, private value: number | boolean) {

    }

    static from(time: number, value: VariableValue): TimedVariableValue {
        return new TimedVariableValue(time, value.getVariableName(), value.getValue());
    }

    /**
     * Makes a deep copy of the supplied value and returns a new instance
     * @param value value to copy from
     */
    static copy(value: TimedVariableValue): TimedVariableValue {
        return new TimedVariableValue(value.time, value.variableName, value.value);
    }

    getTime(): number {
        return this.time;
    }

    getVariableName(): string {
        return this.variableName;
    }

    getValue(): number | boolean {
        return this.value;
    }

    /**
     * Updates this value.
     * @param newValue new value
     */
    update(time: number, newValue: VariableValue): void {
        this.time = time;
        this.value = newValue.getValue();
    }

    /**
     * Determines whether the variable name and value are the same, ignoring the timestamp.
     * @param other other timed variable value
     */
    sameValue(other: TimedVariableValue): boolean {
        return this.getVariableName() === other.getVariableName()
            && this.getValue() === other.getValue();
    }
}
/**
 * Variable value initialiation in the problem file.
 */
export class VariableValue {
    constructor(private variableName: string, private value: number | boolean) {

    }

    getVariableName(): string {
        return this.variableName;
    }

    getValue(): number | boolean {
        return this.value;
    }
}

/**
 * Domain file.
 */
export class DomainInfo extends FileInfo {
    private predicates: Variable[] = [];
    private functions: Variable[] = [];
    private derived: Variable[] = [];
    actions: Action[] = [];
    typeInheritance: DirectionalGraph;
    constants: TypeObjects[] = [];

    constructor(fileUri: string, version: number, domainName: string) {
        super(fileUri, version, domainName);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    getPredicates(): Variable[] {
        return this.predicates;
    }

    setPredicates(predicates: Variable[]): void {
        this.predicates = predicates;
    }

    getFunctions(): Variable[] {
        return this.functions;
    }

    setFunctions(functions: Variable[]): void {
        this.functions = functions;
    }

    getFunction(liftedVariableNeme: string): Variable {
        return this.functions
            .filter(variable => variable.name.toLocaleLowerCase() === liftedVariableNeme)
            .find(_ => true);
    }

    getLiftedFunction(groundedVariable: Variable): Variable {
        return this.getFunction(groundedVariable.name);
    }

    getDerived(): Variable[] {
        return this.derived;
    }

    setDerived(derived: Variable[]): void {
        this.derived = derived;
    }

    setActions(actions: Action[]): void {
        this.actions = actions;
    }

    getActions(): Action[] {
        return this.actions;
    }

    setTypeInheritance(typeInheritance: DirectionalGraph): void {
        this.typeInheritance = typeInheritance;
    }

    setConstants(constants: TypeObjects[]): void {
        if (constants == undefined) throw new Error("Constants must be defined or empty.")
        this.constants = constants;
    }

    getTypes(): string[] {
        return this.typeInheritance.getVertices()
            .filter(t => t != "object");
    }

    isDomain(): boolean {
        return true;
    }

    getTypesInheritingFrom(type: string): string[] {
        return this.typeInheritance.getSubtreePointingTo(type);
    }

    TYPES_SECTION_START = "(:types";

    getTypeLocation(type: string): PddlRange {
        let pattern = `\\b${type}\\b`;
        let regexp = new RegExp(pattern, "gi");
        let foundTypesStart = false;
        let lines = this.getText().split('\n');
        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            let lineWithoutComments = line.split(';')[0];
            let offset = 0;
            if (!foundTypesStart) {
                let typesSectionStartIdx = lineWithoutComments.indexOf(this.TYPES_SECTION_START);
                if (typesSectionStartIdx > -1) {
                    foundTypesStart = true;
                    offset = typesSectionStartIdx + this.TYPES_SECTION_START.length;
                }
            }
            if (foundTypesStart) {
                regexp.lastIndex = offset;
                let match = regexp.exec(lineWithoutComments);
                if (match) {
                    return new PddlRange(lineIdx, match.index, lineIdx, match.index + match[0].length);
                }
            }
        }

        return null;
    }

    findVariableLocation(variable: Variable): void {
        if (variable.location) return;//already initialized

        super.findVariableReferences(variable, (location, line) => {
            let commentStartColumn = line.indexOf(';');
            variable.location = location;

            if (commentStartColumn > -1) {
                variable.setDocumentation(line.substr(commentStartColumn + 1).trim());
            }
            return false; // we do not continue the search after the first hit
        });

        let lines = this.getText().split('\n');
        let pattern = "\\(\\s*" + variable.name + "( [^\\)]*)?\\)";
        let regexp = new RegExp(pattern, "gi");
        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            regexp.lastIndex = 0;
            let commentStartColumn = line.indexOf(';');
            let match = regexp.exec(line);
            if (match) {
                if (commentStartColumn > -1 && match.index > commentStartColumn) continue;

                variable.location = new PddlRange(lineIdx, match.index, lineIdx, match.index + match[0].length);

                if (commentStartColumn > -1) {
                    variable.setDocumentation(line.substr(commentStartColumn + 1).trim());
                }

                return;
            }
        }
    }
}

/**
 * Plan file.
 */
export class PlanInfo extends FileInfo {
    steps: PlanStep[] = [];

    constructor(fileUri: string, version: number, public problemName: string, public domainName: string, text: string) {
        super(fileUri, version, problemName);
        this.setText(text);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PLAN;
    }

    setSteps(steps: PlanStep[]): void {
        this.steps = steps;
    }

    getSteps(): PlanStep[] {
        return this.steps;
    }

    isPlan(): boolean {
        return true;
    }

    static getHappenings(planSteps: PlanStep[]): Happening[] {
        // todo: when flatMap is available, rewrite this...
        let happenings: Happening[] = [];
        planSteps
            .forEach((planStep, idx, allSteps) =>
                happenings.push(...planStep.getHappenings(allSteps.slice(0, idx-1))));

        var compare = function(happening1: Happening, happening2: Happening): number {
            if (happening1.getTime() != happening2.getTime()) return happening1.getTime() - happening2.getTime();
            else {
                return happening1.getFullActionName().localeCompare(happening2.getFullActionName());
            }
        };

        return happenings.sort(compare);
    }

    getHappenings(): Happening[] {
        return PlanInfo.getHappenings(this.getSteps());
    }
}


export class UnknownFileInfo extends FileInfo {
    constructor(fileUri: string, version: number) {
        super(fileUri, version, "");
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    isUnknownPddl(): boolean {
        return true;
    }
}


/**
 * Holds objects belonging to the same type.
 */
export class TypeObjects {
    objects: string[] = [];

    constructor(public type: string) { }

    addAllObjects(objects: string[]): TypeObjects {
        objects.forEach(o => this.objects.push(o));

        return this;
    }

    hasObject(objectName: string): boolean {
        return this.objects.some(o => o.toLowerCase() === objectName.toLowerCase());
    }

    getObjectInstance(objectName: string): ObjectInstance {
        return new ObjectInstance(objectName, this.type);
    }

    static concatObjects(constants: TypeObjects[], objects: TypeObjects[]): TypeObjects[] {
        let mergedObjects: TypeObjects[] = [];

        constants.concat(objects).forEach(typeObj => {
            let typeFound = mergedObjects.find(to1 => to1.type == typeObj.type);

            if (!typeFound) {
                typeFound = new TypeObjects(typeObj.type);
                mergedObjects.push(typeFound);
            }

            typeFound.addAllObjects(typeObj.objects);
        });

        return mergedObjects;
    }

}

export class Action {
    location: PddlRange = null; // initialized lazily
    documentation = ''; // initialized lazily

    constructor(public name: string, public isDurative: boolean) {

    }
}

// Language ID of Domain and Problem files
export const PDDL = 'pddl';
// Language ID of Plan files
export const PLAN = 'plan';
// Language ID of Happenings files
export const HAPPENINGS = 'happenings';

var languageMap = new Map<string, PddlLanguage>([
	[PDDL, PddlLanguage.PDDL],
	[PLAN, PddlLanguage.PLAN],
	[HAPPENINGS, PddlLanguage.HAPPENINGS]
]);

export function toLanguageFromId(languageId: string): PddlLanguage {
	return languageMap.get(languageId);
}

export interface PlanMetaData { domainName: string, problemName: string }

export const UNSPECIFIED_PROBLEM = 'unspecified';
export const UNSPECIFIED_DOMAIN = 'unspecified';