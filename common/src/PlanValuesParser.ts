/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanStep } from './PlanStep';
import { Variable } from './FileInfo';

export class PlanValuesParser {

    stateValues: StateValues[] = [];

    constructor(public steps: PlanStep[], public functions: Variable[], actionFunctionValues: String[]) {

        if (steps.length !== actionFunctionValues.length) {
            throw new Error("Plan steps and action values do not correspond.");
        }

        steps.forEach((planStep, idx) => {
            let planStepFunctionValues = actionFunctionValues[idx].split(',');

            if (!this.describesInstantaneousAction(planStepFunctionValues)
                && !this.describesDurativeAction(planStepFunctionValues)) {
                throw new Error("Wrong number of values on in the output: " + actionFunctionValues[idx]);
            }

            if (planStep.fullActionName !== planStepFunctionValues[0]) {
                throw new Error("Action name does not match the one in the plan: " + actionFunctionValues[idx]);
            }

            this.addState(planStep.getStartTime(),
                planStepFunctionValues.slice(1, 1 + functions.length));

            if (this.describesDurativeAction(planStepFunctionValues)) {
                this.addState(planStep.getStartTime() + planStep.getDuration(),
                    planStepFunctionValues.slice(1 + functions.length));
            }
        });

        this.stateValues = this.stateValues.sort((s1, s2) => s1.time - s2.time);
    }

    describesInstantaneousAction(planStepFunctionValues: string[]): boolean {
        return this.compareCsvTermsToFunctionCount(planStepFunctionValues, 1);
    }

    describesDurativeAction(planStepFunctionValues: string[]): boolean {
        return this.compareCsvTermsToFunctionCount(planStepFunctionValues, 2);
    }

    compareCsvTermsToFunctionCount(planStepFunctionValues: string[], multiple: number): boolean {
        return planStepFunctionValues.length === 1 + multiple * this.functions.length;
    }

    addState(time: number, values: string[]): void {
        let state = new StateValues(time);

        if (values.length !== this.functions.length) {
            throw new Error(`Expecting number of values (${values}) to match number of functions ${this.functions.length}.`);
        }

        for (let index = 0; index < values.length; index++) {
            const valueAsString = values[index];
            const value = parseFloat(valueAsString);
            state.setValue(this.functions[index].getFullName(), value);
        }

        this.stateValues.push(state);
    }

    getSingleFunctionValues(functionName: String): number[][] {
        return this.stateValues.map(state => [state.time, state.getValue(functionName)]);
    }

    getValues(functionName: String): number[][] {
        let functions = this.functions.filter(f => f.name === functionName);

        return this.stateValues.map(state => this.getStateValues(functions, state));
    }

    getStateValues(groundedFunctions: Variable[], state: StateValues): number[] {
        let values: number[] = [state.time];

        groundedFunctions.forEach(function1 => values.push(state.getValue(function1.getFullName())));

        return values;
    }
}

class StateValues {

    private values = new Map<String, number>();

    constructor(public time: number) { }

    setValue(functionName: String, value: number) {
        this.values.set(functionName, value);
    }

    getValue(functionName: String): number {
        return this.values.has(functionName) ?
            this.values.get(functionName)!
            : Number.NaN;
    }
}