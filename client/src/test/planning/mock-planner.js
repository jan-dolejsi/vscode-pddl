/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/* This is a mock planner for testing purposes. It output the mock problem.plan, or the content
 * of the plan file if one is supplied via command-line. */

var fs = require('fs');

var planFile = 'problem.plan';

if (process.argv.length > 4) {
    planFile = process.argv[2];
}

try {
    var plannerOutput = fs.readFileSync(planFile, 'utf8');
    console.log(plannerOutput);
} catch (e) {
    console.error('Error: ', e.stack);
}