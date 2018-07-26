/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument } from 'vscode';
import { PDDL, PLAN, toLanguageFromId, HAPPENINGS, PlanInfo, ProblemInfo, DomainInfo } from '../../common/src/parser';
import { PddlLanguage } from '../../common/src/FileInfo';
import { HappeningsInfo } from "../../common/src/HappeningsInfo";
import { PddlWorkspace } from '../../common/src/workspace-model';

export function isAnyPddl(doc: TextDocument): boolean {
    return isPddl(doc) || isPlan(doc) || isHappenings(doc);
}

export function isPddl(doc: TextDocument): boolean {
    return doc.languageId == PDDL && doc.uri.scheme != "git";
}

export function isPlan(doc: TextDocument): boolean {
    return doc.languageId == PLAN && doc.uri.scheme != "git";
}

export function isHappenings(doc: TextDocument): boolean {
    return doc.languageId == HAPPENINGS && doc.uri.scheme != "git";
}

export function toLanguage(doc: TextDocument): PddlLanguage {
    return toLanguageFromId(doc.languageId);
}

export function getDomainAndProblemForPlan(planInfo: PlanInfo, pddlWorkspace: PddlWorkspace): DomainAndProblem {
    let problemFileInfo = pddlWorkspace.getProblemFileForPlan(planInfo);

    if (!problemFileInfo) throw new Error(`No problem file with name '(problem ${planInfo.problemName}') and located in the same folder as the plan is open in the editor.`);
    
    let domainFileInfo = pddlWorkspace.getDomainFileFor(problemFileInfo);

    if (!domainFileInfo) throw new Error(`No domain file corresponding to problem '${problemFileInfo.name}' and located in the same folder is open in the editor.`);

    return { problem: problemFileInfo, domain: domainFileInfo };
}

export function getDomainAndProblemForHappenings(happeningsInfo: HappeningsInfo, pddlWorkspace: PddlWorkspace): DomainAndProblem {
    let problemFileInfo = pddlWorkspace.getProblemFileForHappenings(happeningsInfo);

    if (!problemFileInfo) throw new Error(`No problem file with name '(problem ${happeningsInfo.problemName}') and located in the same folder as the plan is open in the editor.`);
    
    let domainFileInfo = pddlWorkspace.getDomainFileFor(problemFileInfo);

    if (!domainFileInfo) throw new Error(`No domain file corresponding to problem '${problemFileInfo.name}' and located in the same folder is open in the editor.`);

    return { problem: problemFileInfo, domain: domainFileInfo };
}

export interface DomainAndProblem {
    domain: DomainInfo,
    problem: ProblemInfo
}