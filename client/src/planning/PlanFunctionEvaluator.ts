/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';

import { Variable } from '../../../common/src/FileInfo';
import { Grounder } from '../../../common/src/Grounder';
import { PlanInfo } from '../../../common/src/parser';
import { TypeObjects } from '../../../common/src/DomainInfo';
import { Plan } from "../../../common/src/Plan";
import { Util } from '../../../common/src/util';
import { PlanTimeSeriesParser } from '../../../common/src/PlanTimeSeriesParser';
import { ValStep } from '../debugger/ValStep';

export class PlanFunctionEvaluator {

    grounder: Grounder;

    constructor(private valueSeqPath: string, private valStepPath: string, private plan: Plan) {
        this.grounder = new Grounder(this.plan.domain, this.plan.problem);
    }

    isAvailable(): boolean {
        return this.valueSeqPath && this.valStepPath ? true : false;
    }

    getValStepPath(): string {
        return this.valStepPath;
    }

    async evaluate(): Promise<Map<Variable, GroundedFunctionValues>> {
        let domainFile = await Util.toPddlFile("domain", this.plan.domain.getText());
        let problemFile = await Util.toPddlFile("problem", this.plan.problem.getText());
        let planFile = await Util.toPddlFile("plan", this.plan.getText());

        let chartData = new Map<Variable, GroundedFunctionValues>();

        let changingGroundedFunctions = await this.getChangingGroundedFunctions();

        let changingFunctionsGrouped = this.groupByLifted(changingGroundedFunctions);

        let liftedFunctions = Array.from(changingFunctionsGrouped.keys());

        await Promise.all(liftedFunctions.map(async (liftedFunction) => {
            let groundedFunctions = changingFunctionsGrouped.get(liftedFunction);
            await this.addChartValues(domainFile, problemFile, planFile, liftedFunction, groundedFunctions, chartData);
        }));

        return chartData;
    }

    groupByLifted(variables: Variable[]): Map<Variable, Variable[]> {
        let grouped = new Map<Variable, Variable[]>();

        variables.forEach(var1 => {
            let lifted = this.plan.domain.getLiftedFunction(var1);
            let grounded = grouped.get(lifted);

            if (grounded) {
                grounded.push(var1);
            } else {
                grouped.set(lifted, [var1]);
            }
        });

        return grouped;
    }

    async getChangingGroundedFunctions(): Promise<Variable[]> {
        let happenings = PlanInfo.getHappenings(this.plan.steps);

        let finalStateValues = await new ValStep(this.plan.domain, this.plan.problem).execute(this.valStepPath, "", happenings);

        if (finalStateValues === null) { return []; }

        return finalStateValues
            .map(value => this.getFunction(value.getVariableName()))
            .filter(variable => variable); // filter out null values
    }

    getFunction(variableName: string): Variable {
        let variableNameFragments = variableName.split(" ");
        let liftedVariableName = variableNameFragments[0];
        let liftedVariable = this.plan.domain.getFunction(liftedVariableName);
        if (!liftedVariable) { return liftedVariable; }
        let allConstantsAndObjects = TypeObjects.concatObjects(this.plan.domain.constants, this.plan.problem.objects);
        let objects = variableNameFragments.slice(1)
            .map(objectName => allConstantsAndObjects.find(typeObj => typeObj.hasObject(objectName)).getObjectInstance(objectName));
        return liftedVariable.bind(objects);
    }

    async tryAddChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, groundedFunctions: Variable[], chartData: Map<Variable, GroundedFunctionValues>) {
        try {
            await this.addChartValues(domainFile, problemFile, planFile, liftedFunction, groundedFunctions, chartData);
        } catch (err) {
            console.log("Cannot get values for function " + liftedFunction.getFullName());
            console.log(err);
        }
    }

    async addChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, groundedFunctions: Variable[], chartData: Map<Variable, GroundedFunctionValues>) {
        if (groundedFunctions.length === 0) { return; }

        let functions = groundedFunctions
            .map(f => f.parameters.length > 0 ? `"${f.getFullName()}"` : f.getFullName())
            .map(name => name.toLowerCase())
            .join(' ')
            .toLowerCase();

        const valueSeqCommand = `${Util.q(this.valueSeqPath)} -T ${domainFile} ${problemFile} ${planFile} ${functions}`;
        console.log(valueSeqCommand);
        let child = await process.execSync(valueSeqCommand);

        let csv = child.toString();
        console.log(csv);

        let parser = new PlanTimeSeriesParser(groundedFunctions, csv);

        let functionsValuesValues = parser.getFunctionData(liftedFunction);
        if (functionsValuesValues.isConstant()) { return; } // it is not interesting...
        let functionValues = new GroundedFunctionValues(liftedFunction, functionsValuesValues.values, functionsValuesValues.legend);
        chartData.set(liftedFunction, functionValues.adjustForStepFunctions());
    }

    ground(variable: Variable): Variable[] {
        return this.grounder.ground(variable);
    }
}

/**
 * Holds graph values for functions grounded from the same lifted function.
 */
class GroundedFunctionValues {
    values: number[][];
    constructor(public liftedVariable: Variable, values: number[][], public legend: string[]) {
        this.values = values.map(row => row.map(v => this.undefinedToNull(v)));
    }

    undefinedToNull(value: number): number {
        return value === undefined ? null : value;
    }

    adjustForStepFunctions(): GroundedFunctionValues {
        let adjustedValues: number[][] = [];
        let previousTime = -1;

        for (let index = 0; index < this.values.length; index++) {
            let time = this.values[index][0];

            if (previousTime > time) {
                time = previousTime + 1e-10;
            } else if (previousTime === time) {
                time += 1e-10;
            }

            adjustedValues.push([time].concat(this.values[index].slice(1)));

            previousTime = time;
        }

        return new GroundedFunctionValues(this.liftedVariable, adjustedValues, this.legend);
    }
}