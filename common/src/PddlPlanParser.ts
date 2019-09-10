/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from './Plan';
import { PlanStep } from './PlanStep';
import { ProblemInfo } from './parser';
import { DomainInfo } from './DomainInfo';
 
/**
 * Parses plan in the PDDL form incrementally - line/buffer at a time.
 */
export class PddlPlanParser {

    private readonly plans: Plan[] = [];
    public static readonly planStepPattern = /^\s*((\d+|\d+\.\d+)\s*:)?\s*\((.*)\)\s*(\[\s*(\d+|\d+\.\d+)\s*\])?\s*$/gim;
    private readonly planStatesEvaluatedPattern = /^\s*;?\s*States evaluated[\w ]*:[ ]*(\d*)\s*$/i;
    private readonly planCostPattern = /[\w ]*(cost|metric)[\D :]*[ ]*(\d*|\d*\.\d*)\s*$/i;

    private planBuilder: PlanBuilder;
    private endOfBufferToBeParsedNextTime = '';

    private xmlPlanBuilder: XmlPlanBuilder;

    constructor(private domain: DomainInfo, private problem: ProblemInfo, public readonly options: PddlPlanParserOptions, private onPlanReady?: (plans: Plan[]) => void) {
        this.planBuilder = new PlanBuilder(options.epsilon);
    }

    /**
     * Appends and parses the planner output.
     * @param text planner output
     */
    appendBuffer(text: string): void {
        const textString = this.endOfBufferToBeParsedNextTime + text;
        this.endOfBufferToBeParsedNextTime = '';
        let lastEndLine = 0;
        let nextEndLine: number;
        while ((nextEndLine = textString.indexOf('\n', lastEndLine)) > -1) {
            let nextLine = textString.substring(lastEndLine, nextEndLine + 1);
            if (nextLine.trim()) { this.appendLine(nextLine); }
            lastEndLine = nextEndLine + 1;
        }
        if (textString.length > lastEndLine) {
            this.endOfBufferToBeParsedNextTime = textString.substr(lastEndLine);
        }
    }

    /**
     * Parses one line of parser output.
     * @param outputLine one line of planner output
     */
    appendLine(outputLine: string): void {

        if (this.xmlPlanBuilder || XmlPlanBuilder.isXmlStart(outputLine)) {
            (this.xmlPlanBuilder || (this.xmlPlanBuilder = new XmlPlanBuilder())).appendLine(outputLine);
            if (this.xmlPlanBuilder.isComplete()) {
                // extract plan
                this.xmlPlanBuilder.getPlanSteps()
                    .then(steps => {
                        steps.forEach(step => this.appendStep(step));
                        this.xmlPlanBuilder = null;
                        this.onPlanFinished();
                    })
                    .catch(reason => {
                        console.log(reason);
                    });
            }
        }

        let planStep = this.planBuilder.parse(outputLine, undefined);
        if (planStep) {
            // this line is a plan step
            this.appendStep(planStep);
        } else {
            // this line is NOT a plan step
            if (this.planBuilder.parsingPlan) {
                this.planBuilder.parsingPlan = false;
                this.onPlanFinished();
            }

            let group: RegExpExecArray;
            this.planStatesEvaluatedPattern.lastIndex = 0;
            this.planCostPattern.lastIndex = 0;
            if (group = this.planStatesEvaluatedPattern.exec(outputLine)) {
                this.planBuilder.statesEvaluated = parseInt(group[1]);
            }
            else if (group = this.planCostPattern.exec(outputLine)) {
                this.planBuilder.cost = parseFloat(group[2]);
            }
        }

        this.planBuilder.outputText += outputLine;
    }

    /**
     * Appends plan step. Use this when the plan does not need parsing.
     * @param planStep plan step to add to the plan
     */
    appendStep(planStep: PlanStep) {
        this.planBuilder.add(planStep);
        if (!this.planBuilder.parsingPlan) { this.planBuilder.parsingPlan = true; }
    }

    /**
     * Call this when the planning engine stopped. This flushes the last line in the buffered output through the parsing 
     * and adds the last plan to the collection of plans.
     */
    onPlanFinished(): void {
        if (this.endOfBufferToBeParsedNextTime.length) {
            this.appendLine(this.endOfBufferToBeParsedNextTime);
            this.endOfBufferToBeParsedNextTime = '';
        }
        if (this.planBuilder.getSteps().length > 0 ||
            this.plans.length < this.options.minimumPlansExpected) {
            this.plans.push(this.planBuilder.build(this.domain, this.problem));
            this.planBuilder = new PlanBuilder(this.options.epsilon);
        }

        if (this.onPlanReady) { this.onPlanReady.apply(this, [this.plans]); }
    }

    /** Gets current plan's provisional makespan. */
    getCurrentPlanMakespan(): number {
        return this.planBuilder.getMakespan();
    }

    /**
     * Gets all plans.
     */
    getPlans(): Plan[] {
        return this.plans;
    }
}

/**
 * Utility for incremental plan building as it is being parsed.
 */
export class PlanBuilder {
    statesEvaluated: number;
    cost: number;
    private steps: PlanStep[] = [];

    outputText = ""; // for information only
    parsingPlan = false;
    makespan = 0;

    constructor(private epsilon: number) { }

    parse(planLine: string, lineIndex: number | undefined): PlanStep | undefined {
        PddlPlanParser.planStepPattern.lastIndex = 0;
        let group = PddlPlanParser.planStepPattern.exec(planLine);
        if (group) {
            // this line is a valid plan step
            let time = group[2] ? parseFloat(group[2]) : this.getMakespan();
            let action = group[3];
            let isDurative = group[5] ? true : false;
            let duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            return new PlanStep(time, action, isDurative, duration, lineIndex);
        } else {
            return undefined;
        }
    }

    add(step: PlanStep) {
        if (this.makespan < step.getEndTime()) {
            this.makespan = step.getEndTime();
        }
        this.steps.push(step);
    }

    getSteps(): PlanStep[] {
        return this.steps;
    }

    build(domain: DomainInfo, problem: ProblemInfo): Plan {
        let plan = new Plan(this.steps, domain, problem);

        plan.statesEvaluated = this.statesEvaluated;
        // if cost was not output by the planning engine, use the plan makespan
        plan.cost = this.cost ? this.cost : this.getMakespan();

        return plan;
    }

    getMakespan(): number {
        return this.makespan;
    }
}

class XmlPlanBuilder {

    private xmlText = '';

    static isXmlStart(outputLine: string): boolean {
        return outputLine.match(/<\?xml /) !== null;
    }

    appendLine(outputLine: string) {
        this.xmlText += outputLine;
    }

    isComplete(): boolean {
        return this.xmlText.match(/<\/Plan>\s*$/) !== null;
    }

    async getPlanSteps(): Promise<PlanStep[]> {
        const xml2js = require('xml2js');
        const pxd = require('parse-xsd-duration');
        let parser = new xml2js.Parser();
        var plan: any;
        try {
            plan = await parser.parseStringPromise(this.xmlText);
        } catch (err) {
            console.log(err);
            throw err;
        }
        const steps: PlanStep[] = [];
        for (let happening of plan.Plan.Actions[0].OrderedHappening) {
            //const happeningId = happening.HappeningID[0];
            if (happening.Happening[0].ActionStart) {
                const actionStart = happening.Happening[0].ActionStart[0];
                const startTime = pxd.default(actionStart.ExpectedStartTime[0]);
                const actionName = actionStart.Name[0];
                const actionParameters = actionStart.Parameters 
                    ? ' ' + actionStart.Parameters[0].Parameter.map((p: any) => p.Symbol[0]).join(' ') 
                    : '';
                const isDurative = actionStart.ExpectedDuration !== undefined;
                const duration = isDurative ? pxd.default(actionStart.ExpectedDuration[0]) : null;
                steps.push(new PlanStep(startTime, actionName + actionParameters, isDurative, duration, -1));
            }
        }
        return steps;
    }
}

export interface PddlPlanParserOptions {
    epsilon: number;
    minimumPlansExpected?: number;
}