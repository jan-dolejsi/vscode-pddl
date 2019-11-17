/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlExtensionContext } from "./PddlExtensionContext";
import { PlanStep } from "./PlanStep";
import { PlanBuilder } from "./PddlPlanParser";
import { HappeningsInfo, PlanHappeningsBuilder, Happening } from "./HappeningsInfo";
import { FileInfo, PddlLanguage } from "./FileInfo";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { DocumentPositionResolver } from "./DocumentPositionResolver";
import { DomainInfo } from "./DomainInfo";
import { PddlDomainParser } from "./PddlDomainParser";
import { PddlProblemParser } from "./PddlProblemParser";
import { ProblemInfo } from "./ProblemInfo";

export class Parser {

    
    private problemParser: PddlProblemParser;

    constructor(context?: PddlExtensionContext) {
        if (context) {
            this.problemParser = new PddlProblemParser(context);
        } else {
            this.problemParser = new PddlProblemParser();
        }
    }

    async tryProblem(fileUri: string, fileVersion: number, fileText: string, syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver): Promise<ProblemInfo | undefined> {
        return this.problemParser.parse(fileUri, fileVersion, fileText, syntaxTree, positionResolver);
    }

    tryDomain(fileUri: string, fileVersion: number, fileText: string, syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver): DomainInfo | undefined {

        //(define (domain domain_name)

        let defineNode = syntaxTree.getDefineNode();
        if (!defineNode) { return undefined; }

        let domainNode = defineNode.getFirstOpenBracket('domain');
        if (!domainNode) { return undefined; }

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

export function toLanguageFromId(languageId: string): PddlLanguage | undefined {
    return languageMap.get(languageId);
}

export interface PlanMetaData {
    readonly domainName: string;
    readonly problemName: string;
}

export const UNSPECIFIED_PROBLEM = 'unspecified';
export const UNSPECIFIED_DOMAIN = 'unspecified';