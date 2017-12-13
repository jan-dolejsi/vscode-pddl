/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanStep } from './PlanStep';
import { Variable } from './parser';

export class PlanValuesParser {

    stateValues: StateValues[] = [];

    constructor(public steps: PlanStep[], public functions: Variable[], actionFunctionValues: String[]){
        
        if(steps.length != actionFunctionValues.length) {
            throw new Error("Plan steps and action values do not correspond.");
        }        
        
        steps.forEach((planStep, idx) => {
            let planStepFunctionValues = actionFunctionValues[idx].split(',');

            if (planStepFunctionValues.length < 1 + 2 * this.functions.length) {
                throw new Error("Not enough commas: " + actionFunctionValues[idx]);
            }

            if(planStep.fullActionName != planStepFunctionValues[0]){
                throw new Error("Action name does not match the one in the plan: " + actionFunctionValues[idx]);                
            }

            this.addState(planStep.time, 
                planStepFunctionValues.slice(1, 1 + functions.length));

            this.addState(planStep.time + planStep.duration, 
                planStepFunctionValues.slice(1 + functions.length));
        });

        this.stateValues = this.stateValues.sort((s1, s2) => s1.time - s2.time);
    }

    addState(time: number, values: string[]): void {
        let state = new StateValues(time);

        if(values.length != this.functions.length) {
            throw new Error(`Expecting number of values (${values}) to match number of functions ${this.functions.length}.`)
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
        let functions = this.functions.filter(f => f.name == functionName); 

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

    constructor(public time: number){}

    setValue(functionName: String, value: number) {
        this.values.set(functionName, value);
    }

    getValue(functionName: String): number {
        return this.values.get(functionName);
    }
}