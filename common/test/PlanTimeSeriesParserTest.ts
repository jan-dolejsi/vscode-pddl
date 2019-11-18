/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanTimeSeriesParser, FunctionValues, StateValues, FunctionsValues } from '../src/PlanTimeSeriesParser';
import * as assert from 'assert';
import { Variable, ObjectInstance, Parameter } from '../src/FileInfo';

describe('PlanTimeSeriesParser', () => {

    beforeEach(function () {
    });

    describe('#getFunctionValues', () => {
        it('parses one function', () => {
            // GIVEN
            let functionName = "function1 param1 param2";
            let typeName = "type1";
            let csvData = functionName + `
            0, 10
            1, 11`;
            let function1 = new Variable(functionName, [new ObjectInstance("param1", typeName), new ObjectInstance("param2", typeName)]);

            // WHEN
            let parser = new PlanTimeSeriesParser([function1], csvData);

            // THEN
            assert.ok(parser.getFunctionValues(function1), "there should be values for this function");
            let functionValues = parser.getFunctionValues(function1);
            assert.equal(functionValues?.getLegend(), "param1 param2");
            assert.equal(functionValues?.variable, function1);
            assert.equal(functionValues?.values.length, 2, "there should be 2 x/y points");
            let values = functionValues?.values;
            assert.deepEqual(values, [[0, 10], [1, 11]]);
        });

        it('parses two functions', () => {
            // GIVEN
            let functionName1 = "function1";
            let function1 = new Variable(functionName1, []);

            let functionName2 = "function2";
            let function2 = new Variable(functionName2, []);
            
            let csvData = `${functionName1}
            0, 10
            1, 11
            ${functionName2}
            0, 5
            1.5, 7`;

            // WHEN
            let parser = new PlanTimeSeriesParser([function1, function2], csvData);

            // THEN
            assert.ok(parser.getFunctionValues(function1), "there should be values for this function1");
            let functionValues1 = parser.getFunctionValues(function1);
            assert.equal(functionValues1?.getLegend(), "");
            assert.equal(functionValues1?.variable, function1);
            let values1 = functionValues1?.values;
            assert.deepEqual(values1, [[0, 10], [1, 11]]);

            assert.ok(parser.getFunctionValues(function2), "there should be values for this function2");
            let functionValues2 = parser.getFunctionValues(function2);
            assert.equal(functionValues2?.getLegend(), "");
            assert.equal(functionValues2?.variable, function2);
            let values2 = functionValues2?.values;
            assert.deepEqual(values2, [[0, 5], [1.5, 7]]);
        });
    });

    
    describe('#getGroundedFunctionsValues', () => {
        it('finds two grounded function values', () => {
            // GIVEN
            let typeName = "type1";
            let functionName = "function1";
            let liftedFunction = new Variable(functionName, [new Parameter("p1", typeName)]);

            let function1 = liftedFunction.bind([new ObjectInstance('o1', typeName)]);

            let function2 = liftedFunction.bind([new ObjectInstance('o2', typeName)]);
            
            let csvData = `${function1.getFullName()}
            0, 10
            1, 11
            ${function2.getFullName()}
            0, 5
            1.5, 7`;

            // WHEN
            let parser = new PlanTimeSeriesParser([function1, function2], csvData);

            // THEN
            assert.equal(parser.getGroundedFunctionsValues(liftedFunction).length, 2, "there should be two results for this liftedFunction");
        });
    });
   
    describe('#getFunctionData', () => {
        it('finds single function data', () => {
            // GIVEN
            let functionName = "function1";
            let csvData = functionName + `
            0, 10
            1, 11`;
            let function1 = new Variable(functionName);

            // WHEN
            let parser = new PlanTimeSeriesParser([function1], csvData);

            // THEN
            assert.ok(parser.getFunctionData(function1), "there should be values for this function");
            let functionValues = parser.getFunctionData(function1);
            assert.equal(functionValues.values.length, 2, "there should be 2 x-y points");
            assert.deepEqual(functionValues.values, [[0, 10], [1, 11]]);
            assert.equal(functionValues.liftedVariable, function1, "lifted function");
            assert.deepEqual(functionValues.functions.length, 1, "#functions");
            assert.deepEqual(functionValues.functions[0], function1, "function[1]");
            assert.deepEqual(functionValues.legend, [functionName], "legend");
        });
        
        it('finds two grounded function values', () => {
            // GIVEN
            let typeName = "type1";
            let functionName = "function1";
            let liftedFunction = new Variable(functionName, [new Parameter("p1", typeName)]);

            let function1 = liftedFunction.bind([new ObjectInstance('o1', typeName)]);

            let function2 = liftedFunction.bind([new ObjectInstance('o2', typeName)]);
            
            let csvData = `${function1.getFullName()}
            0, 10
            1, 11
            ${function2.getFullName()}
            0, 5
            1.5, 7`;

            // WHEN
            let parser = new PlanTimeSeriesParser([function1, function2], csvData);

            // THEN
            let data = parser.getFunctionData(liftedFunction);
            assert.equal(data.values.length, 3, "there should be three merged results for this liftedFunction");
            assert.deepEqual(data.values[0], [0, 10, 5], 'first timestamp ...');
        });
    });

    describe('#join', () => {
        it('joins first function', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let functionValues = new FunctionValues(function1);
            let time = 0.1;
            let value = 1;
            functionValues.addValue(time, value);

            // WHEN
            let states = PlanTimeSeriesParser.join([], functionValues);

            // THEN
            assert.equal(states.length, 1, "there should be one state");
            assert.equal(states[0].time, time);
            assert.equal(states[0].getValue(function1), value, "expected value");
        });

        it('joins second function', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let previousStateValues = new StateValues(0);
            previousStateValues.setValue(function1, 0);

            let functionValues = new FunctionValues(function1);
            let time = 0.1;
            let value = 1;
            functionValues.addValue(time, value);

            // WHEN
            let states = PlanTimeSeriesParser.join([previousStateValues], functionValues);

            // THEN
            assert.equal(states.length, 2, "there should be two states");
            assert.equal(states[0].time, 0, "time of first data point");
            assert.equal(states[0].getValue(function1), 0, "expected value");
            assert.equal(states[1].time, time, "time of second data point");
            assert.equal(states[1].getValue(function1), value, "expected value");
        });
    });
});

describe('FunctionsValues', () => {

    beforeEach(function () { 
    });

    describe('#isConstant', () => {
        it('single function single value is constant', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let values = [[0, 1]];

            // WHEN
            let functionsValues = new FunctionsValues(function1, values, [function1]);
            
            // // THEN
            assert.ok(functionsValues.isConstant(), "single value should be constant");
        });

        it('single function two identical values are constant', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let values = [[0, 1], [1, 1]];

            // WHEN
            let functionsValues = new FunctionsValues(function1, values, [function1]);
            
            // // THEN
            assert.ok(functionsValues.isConstant(), "single value should be constant");
        });

        it('two functions two identical values are constant', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let values = [[0, 1, 2], [1, 1, 2]];

            // WHEN
            let functionsValues = new FunctionsValues(function1, values, [function1]);
            
            // // THEN
            assert.ok(functionsValues.isConstant(), "two values should be constant");
        });

        it('single function two different values are NOT constant', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let values = [[0, 1], [1, 100]];

            // WHEN
            let functionsValues = new FunctionsValues(function1, values, [function1]);
            
            // // THEN
            assert.equal(functionsValues.isConstant(), false, "different value series should not be constant");
        });

        it('two functions, where one has two different values are NOT constant', () => {
            // GIVEN
            let functionName = "function1";
            let function1 = new Variable(functionName, []);
            let values = [[0, 1, 5], [1, 100, 5]];

            // WHEN
            let functionsValues = new FunctionsValues(function1, values, [function1]);
            
            // // THEN
            assert.equal(functionsValues.isConstant(), false, "different value series for one function should not be constant");
        });

    });
});