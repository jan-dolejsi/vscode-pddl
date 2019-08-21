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
import { HappeningsInfo, PlanHappeningsBuilder, Happening } from "./HappeningsInfo";
import { FileInfo, PddlLanguage, ParsingProblem, stripComments } from "./FileInfo";
import { PreProcessingError, PreProcessor } from "./PreProcessors";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { DocumentPositionResolver } from "./DocumentPositionResolver";
import { DomainInfo, TypeObjects } from "./DomainInfo";
import { PddlDomainParser } from "./PddlDomainParser";

export class Parser {

    domainPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)/gi;
    problemPattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)/gi;
    problemCompletePattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)\s*(\(:requirements\s*([^\)]*)\))?\s*(\(:objects\s*([^\)]*)\))?\s*\(:init\s*([\s\S]*)\s*\)\s*\(:goal\s*([\s\S]*?)\s*\)\s*(\(:constraints\s*([\s\S]*?)\s*\))?\s*(\(:metric\s*([\s\S]*?)\s*\))?\s*\)\s*$/gi;

    problemPreParser: ProblemParserPreProcessor;

    constructor(context?: PddlExtensionContext) {
        if (context) {
            this.problemPreParser = new ProblemParserPreProcessor(context);
        }
    }

    async tryProblem(fileUri: string, fileVersion: number, fileText: string, syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver): Promise<ProblemInfo> {
        let filePath = Util.fsPath(fileUri);
        let workingDirectory = dirname(filePath);
        let preProcessor = null;

        try {
            if (this.problemPreParser) { 
                preProcessor = this.problemPreParser.createPreProcessor(fileText);
                fileText = await this.problemPreParser.process(preProcessor, fileText, workingDirectory); 
            }
        } catch (ex) {
            let problemInfo = new ProblemInfo(fileUri, fileVersion, "unknown", "unknown", PddlSyntaxTree.EMPTY, positionResolver);
            problemInfo.setText(fileText);
            if (ex instanceof PreProcessingError) {
                let parsingError = <PreProcessingError>ex;
                problemInfo.addProblems([new ParsingProblem(parsingError.message, parsingError.line, parsingError.column)]);
            }
            else {
                let line = preProcessor?positionResolver.resolveToPosition(preProcessor.metaDataLineOffset).line : 0;
                problemInfo.addProblems([new ParsingProblem(ex.message || ex, line, 0)]);
            }
            problemInfo.setPreParsingPreProcessor(preProcessor);
            return problemInfo;
    }

        let pddlText = stripComments(fileText);

        this.problemPattern.lastIndex = 0;
        let matchGroups = this.problemPattern.exec(pddlText);

        if (matchGroups) {
            let problemName = matchGroups[1];
            let domainName = matchGroups[2];

            let problemInfo = new ProblemInfo(fileUri, fileVersion, problemName, domainName, syntaxTree, positionResolver);
            problemInfo.setText(fileText);
            this.getProblemStructure(pddlText, problemInfo);
            problemInfo.setPreParsingPreProcessor(preProcessor);
            return problemInfo;
        }
        else {
            return null;
        }
    }

    tryDomain(fileUri: string, fileVersion: number, fileText: string, syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver): DomainInfo {

        //(define (domain domain_name)

        let defineNode = syntaxTree.getDefineNode();
        if (!defineNode) { return null; }

        let domainNode = defineNode.getFirstOpenBracket('domain');
        if (!domainNode) { return null; }

        return new PddlDomainParser(fileUri, fileVersion, fileText, domainNode, syntaxTree, positionResolver).getDomain();
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

    parsePlan(fileUri: string, fileVersion: number, fileText: string, epsilon: number, positionResolver: DocumentPositionResolver): PlanInfo {
        let meta = Parser.parsePlanMeta(fileText);

        let planInfo = new PlanInfo(fileUri, fileVersion, meta.problemName, meta.domainName, fileText, positionResolver);
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

    parseHappenings(fileUri: string, fileVersion: number, fileText: string, epsilon: number, positionResolver: DocumentPositionResolver): HappeningsInfo {
        let meta = Parser.parsePlanMeta(fileText);

        let happeningsInfo = new HappeningsInfo(fileUri, fileVersion, meta.problemName, meta.domainName, fileText, positionResolver);
        let planBuilder = new PlanHappeningsBuilder(epsilon);
        planBuilder.tryParseFile(fileText);
        happeningsInfo.setHappenings(planBuilder.getHappenings());
        happeningsInfo.addProblems(planBuilder.getParsingProblems());
        planBuilder.validateOpenQueueIsEmpty();

        return happeningsInfo;
    }

    getProblemStructure(problemText: string, problemInfo: ProblemInfo): void {
        let defineNode = problemInfo.syntaxTree.getDefineNodeOrThrow();
        PddlDomainParser.parseRequirements(defineNode, problemInfo);

        this.problemCompletePattern.lastIndex = 0;
        let matchGroups = this.problemCompletePattern.exec(problemText);

        if (matchGroups) {
            let objectsText = matchGroups[6];
            problemInfo.setObjects(PddlDomainParser.toTypeObjects(PddlDomainParser.parseInheritance(objectsText)));

            let initText = matchGroups[7];
            problemInfo.setInits(this.parseInit(initText));
        }
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
        while (match = this.problemInitPattern.exec(initText)) {
            var time = 0;
            var variableName: string;
            var value: number | boolean;

            if (match[1].match(/^\s*\(at\s+[\d.]+/)) {
                // time initial...
                time = parseInt(match[5]);

                if (match[6] && match[6].startsWith('(=')) {
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
                if (match[1].startsWith('(=')) {
                    // initial fluent value
                    variableName = match[2];
                    value = parseFloat(match[3]);
                }
                else {
                    // initialized literal
                    variableName = match[4];
                    value = true;
                }
            }

            variableInitValues.push(new TimedVariableValue(time, variableName, value));
        }

        return variableInitValues;
    }
}

/**
 * Problem file.
 */
export class ProblemInfo extends FileInfo {
    objects: TypeObjects[] = [];
    inits: TimedVariableValue[] = [];
    preParsingPreProcessor: PreProcessor;

    constructor(fileUri: string, version: number, problemName: string, public domainName: string, public readonly syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, problemName, positionResolver);
    }

    setPreParsingPreProcessor(preProcessor: PreProcessor) {
        this.preParsingPreProcessor = preProcessor;
    }
    
    getPreParsingPreProcessor(): PreProcessor {
        return this.preParsingPreProcessor;
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    setObjects(objects: TypeObjects[]): void {
        this.objects = objects;
    }

    getObjects(type: string): string[] {
        let thisTypesObjects = this.objects.find(to => to.type === type);

        if (!thisTypesObjects) { return []; }
        else { return thisTypesObjects.getObjects(); }
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

    getVariableValue(): VariableValue {
        return new VariableValue(this.variableName, this.value);
    }

    toString(): string {
        return `${this.variableName}=${this.value} @ ${this.time}`;
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
 * Plan file.
 */
export class PlanInfo extends FileInfo {
    steps: PlanStep[] = [];

    constructor(fileUri: string, version: number, public problemName: string, public domainName: string, text: string, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, problemName, positionResolver);
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
                happenings.push(...planStep.getHappenings(allSteps.slice(0, idx - 1))));

        var compare = function (happening1: Happening, happening2: Happening): number {
            if (happening1.getTime() !== happening2.getTime()) { return happening1.getTime() - happening2.getTime(); }
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
    constructor(fileUri: string, version: number, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, "", positionResolver);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }

    isUnknownPddl(): boolean {
        return true;
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

export interface PlanMetaData {
    readonly domainName: string;
    readonly problemName: string;
}

export const UNSPECIFIED_PROBLEM = 'unspecified';
export const UNSPECIFIED_DOMAIN = 'unspecified';