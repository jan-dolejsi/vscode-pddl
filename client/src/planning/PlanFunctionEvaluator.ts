/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';

import { Variable } from '../../../common/src/parser';
import { Grounder } from '../../../common/src/Grounder';
import { Plan } from "../../../common/src/Plan";
import { Util } from '../../../common/src/util';
import { PlanTimeSeriesParser } from '../../../common/src/PlanTimeSeriesParser';

export class PlanFunctionEvaluator {

    grounder: Grounder;

    constructor(public valueSeqPath: string, public plan: Plan) {
        this.grounder = new Grounder(this.plan.domain, this.plan.problem);
    }

    isAvailable(): boolean {
        return this.valueSeqPath ? true : false;
    }

    async evaluate(): Promise<Map<Variable, GroundedFunctionValues>> {
        let domainFile = Util.toPddlFile("domain", this.plan.domain.text);
        let problemFile = Util.toPddlFile("problem", this.plan.problem.text);
        let planFile = Util.toPddlFile("plan", this.plan.getText());

        let chartData = new Map<Variable, GroundedFunctionValues>();

        let simplyGroundableFunctions = this.plan.domain.getFunctions()
            .filter(liftedFunction => liftedFunction.parameters.length < 2);

        await Promise.all(simplyGroundableFunctions.map(async (liftedFunction) => {
            await this.tryAddChartValues(domainFile, problemFile, planFile, liftedFunction, chartData);
        }))

        return chartData;
    }

    async tryAddChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, chartData: Map<Variable, GroundedFunctionValues>) {
        try {
            await this.addChartValues(domainFile, problemFile, planFile, liftedFunction, chartData);
        } catch (err) {
            console.log("Cannot get values for function " + liftedFunction.getFullName());
            console.log(err);
        }
    }

    async addChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, chartData: Map<Variable, GroundedFunctionValues>) {
        // this forces the variable unit of measure to be parsed    
        this.plan.domain.findVariableLocation(liftedFunction);

        let groundedFunctions = this.ground(liftedFunction);

        if (groundedFunctions.length == 0) return;

        let functions = groundedFunctions
            .map(f => f.parameters.length > 0 ? `"${f.getFullName()}"` : f.getFullName())
            .map(name => name.toLowerCase())
            .join(' ');

        let child = await process.execSync(`${this.valueSeqPath} -T ${domainFile} ${problemFile} ${planFile} ${functions}`);

        let csv = child.toString();

        let parser = new PlanTimeSeriesParser(groundedFunctions, csv);

        let functionsValuesValues = parser.getFunctionData(liftedFunction);
        if (functionsValuesValues.isConstant()) return; // it is not interesting...
        let functionValues = new GroundedFunctionValues(liftedFunction, functionsValuesValues.values, functionsValuesValues.legend);
        chartData.set(liftedFunction, functionValues);
    }

    ground(variable: Variable): Variable[] {
        return this.grounder.ground(variable);
    }
}

class GroundedFunctionValues {
    values: number[][];
    constructor(public liftedVariable: Variable, values: number[][], public legend: string[]) {
        this.values = values.map(row => row.map(v => this.undefinedToNull(v)));
    }

    undefinedToNull(value: number): number {
        return value == undefined ? null : value;
    }
}