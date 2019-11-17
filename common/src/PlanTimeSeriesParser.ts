/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Variable } from './FileInfo';

export class PlanTimeSeriesParser {

    functionValues = new Map<Variable, FunctionValues>();
    warnings: string[];

    constructor(public functions: Variable[], timeSeriesCsv: string) {

        let lines = timeSeriesCsv.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        this.warnings = lines.filter(line => line.includes(':'));

        let currentFunctionValues: FunctionValues | null = null;

        lines
            .filter(line => !line.includes(':'))
            .forEach(line => {
                let newFunction = functions.find(f => f.getFullName().toLowerCase() === line);

                if (newFunction) {
                    if (currentFunctionValues) { this.addFunctionValues(currentFunctionValues); }
                    currentFunctionValues = new FunctionValues(newFunction);
                }
                else {
                    var time; var value;
                    [time, value] = line.split(',').map(v => parseFloat(v.trim()));
                    if (currentFunctionValues === null) {
                        throw new Error(`The ValueSeq output does not include function names ${functions.map(f => f.getFullName())}`);
                    }
                    if (isNaN(time) || value === undefined) {
                        throw new Error(`The ValueSeq output does not parse: ${line}`);
                    }
                    else {
                        if (currentFunctionValues.lastTime() > time) {
                            time = currentFunctionValues.lastTime() + 1e-10;
                        } else if (currentFunctionValues.lastTime() === time) {
                            time += 1e-10;
                        }
                        currentFunctionValues.addValue(time, value);
                    }
                }
            });

        this.warnings.forEach(w => console.log('ValueSeq: ' + w));

        if (currentFunctionValues) {
            this.addFunctionValues(currentFunctionValues);
        }
    }

    private addFunctionValues(newFunctionValues: FunctionValues): void {
        this.functionValues.set(newFunctionValues.variable, newFunctionValues);
    }

    getFunctionValues(variable: Variable): FunctionValues | undefined {
        return this.functionValues.get(variable);
    }

    getGroundedFunctionsValues(liftedVariable: Variable): FunctionValues[] {
        let groundedFunctions = [...this.functionValues.keys()]
            .filter(var1 => var1.name === liftedVariable.name);

        return groundedFunctions
            .map(f => this.functionValues.get(f))
            .filter(f => !!f)
            .map(f => f!);
    }

    getFunctionData(liftedVariable: Variable): FunctionsValues {
        let functionValues = this.getGroundedFunctionsValues(liftedVariable);

        let groundedFunctions = functionValues.map(fv => fv.variable);

        let states: StateValues[] = functionValues.reduce((previousValues, currentValues) =>
            PlanTimeSeriesParser.join(previousValues, currentValues), new Array<StateValues>());

        let data = states.map(state => state.toNumbers(groundedFunctions));

        return new FunctionsValues(liftedVariable, data, groundedFunctions);
    }

    static join(previousValues: StateValues[], currentValues: FunctionValues): StateValues[] {
        currentValues.values.forEach(timeAndValue => {
            let currentTime = timeAndValue[0];
            let stateFound = previousValues.find(state => state.time === currentTime);
            if (!stateFound) {
                stateFound = new StateValues(currentTime);
                previousValues.push(stateFound);
                previousValues.sort((s1, s2) => s1.time - s2.time);
            }

            stateFound.setValue(currentValues.variable, timeAndValue[1]);
        });

        return previousValues;
    }
}

/**
 * Structure that holds values for multiple functions
 */
export class FunctionsValues {
    legend: string[];

    constructor(public liftedVariable: Variable, public values: number[][], public functions: Variable[]) {
        if (functions.length === 1 && functions[0].parameters.length === 0) {
            // the function had no parameters
            this.legend = [liftedVariable.name];
        }
        else {
            let objects = this.functions.map(f => f.parameters.map(p => p.toPddlString()).join(' '));
            this.legend = objects;
        }
    }

    isConstant(): boolean {
        let that = this;
        return this.functions.every((_, idx) => {
            let firstValue = that.values[0][idx + 1];
            return that.values.every(values1 => values1[idx + 1] === firstValue);
        });
    }
}

export class FunctionValues {
    values: number[][] = [];
    private legend: string;

    constructor(public variable: Variable) {
        this.legend = variable.parameters.map(p => p.toPddlString()).join(' ');
    }

    addValue(time: number, value: number): void {
        this.values.push([time, value]);
    }

    lastTime(): number {
        return this.values.length > 0 ? this.values[this.values.length - 1][0] : NaN;
    }

    getLegend(): string {
        return this.legend;
    }
}

export class StateValues {
    private values = new Map<Variable, number>();

    constructor(public time: number) {

    }

    setValue(variable: Variable, value: number) {
        this.values.set(variable, value);
    }

    getValue(variable: Variable): number {
        return this.values.has(variable) ?
            this.values.get(variable)! :
            Number.NaN;
    }

    toNumbers(variables: Variable[]): number[] {
        let output = variables.map(f => this.getValue(f));

        output = [this.time].concat(output);

        return output;
    }
}