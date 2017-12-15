/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';

import { PlanValuesParser } from '../../common/src/PlanValuesParser';
import { Variable } from '../../common/src/parser';
import { Grounder } from '../../common/src/Grounder';
import { Plan } from './plan';
import { Util } from '../../common/src/util';

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

        let child = process.execSync(`${this.valueSeqPath} ${domainFile} ${problemFile} ${planFile} ${functions}`);

        let csv = child.toString();
        console.log(csv);

        let lines = csv.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        let parser = new PlanValuesParser(this.plan.steps, groundedFunctions, lines);

        this.plan.domain.getFunctions()
            .filter(liftedFunction => liftedFunction.parameters.length < 2)
            .forEach(liftedFunction => {
            this.plan.domain.findVariableLocation(liftedFunction); // this forces the variable unit of measure to be parsed
            let functionName = liftedFunction.name;
            let values = parser.getValues(functionName);
            let objects = this.grounder.getObjectPermutations(liftedFunction.parameters.map(p => p.type));
            let objectNames = objects.map(obj => obj.join(' '));
            let functionValues = new GroundedFunctionValues(functionName, values, objectNames);
            chartData.set(liftedFunction, functionValues);
        });

        return chartData;
    }

    ground(variable: Variable): Variable[] {
        return this.grounder.ground(variable);
    }
}

class GroundedFunctionValues {
    constructor(public functionName: string, public values: number[][], public objects: string[]) {}
}