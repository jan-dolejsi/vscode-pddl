/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';

import { Variable } from '../../common/src/parser';
import { Grounder } from '../../common/src/Grounder';
import { Plan } from './plan';
import { Util } from '../../common/src/util';
import { PlanTimeSeriesParser } from '../../common/src/PlanTimeSeriesParser';

export class PlanFunctionEvaluator {

    grounder: Grounder;

    constructor(public valueSeqPath: string, public plan: Plan) {
        this.grounder = new Grounder(this.plan.domain, this.plan.problem);
    }

    isAvailable(): boolean {
        return this.valueSeqPath ? true : false;
    }

    evaluate(): Map<Variable, GroundedFunctionValues> {
        let domainFile = Util.toPddlFile("domain", this.plan.domain.text);
        let problemFile = Util.toPddlFile("problem", this.plan.problem.text);
        let planFile = Util.toPddlFile("plan", this.plan.getText());
        let groundedFunctions = this.plan.domain.getFunctions()
            .map(f => this.ground(f))
            .reduce((x, y) => x.concat(y), []);

        let chartData = new Map<Variable, GroundedFunctionValues>();

        if (groundedFunctions.length == 0) return chartData;

        let functions = groundedFunctions
            .map(f => f.parameters.length > 0 ? `"${f.getFullName()}"` : f.getFullName())
            .join(' ');

        let child = process.execSync(`${this.valueSeqPath} -T ${domainFile} ${problemFile} ${planFile} ${functions}`);

        let csv = child.toString();
        console.log(csv);

        let parser = new PlanTimeSeriesParser(groundedFunctions, csv);

        this.plan.domain.getFunctions()
            .filter(liftedFunction => liftedFunction.parameters.length < 2)
            .forEach(liftedFunction => {
            this.plan.domain.findVariableLocation(liftedFunction); // this forces the variable unit of measure to be parsed
            let functionsValuesValues = parser.getFunctionData(liftedFunction);
            let functionValues = new GroundedFunctionValues(liftedFunction, functionsValuesValues.values, functionsValuesValues.legend);
            chartData.set(liftedFunction, functionValues);
        });

        return chartData;
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