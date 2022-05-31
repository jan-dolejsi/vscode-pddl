/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as jsonc from 'jsonc-parser';
import { PackagedServerRequestArgs } from 'pddl-planning-service-client';
import { EndpointService, SelectedEndpoint } from '../planning/PackagedPlanners';
import { PlannerArgumentsGenerator } from '../planning/PlannerArgumentsGenerator';

describe('PlannerArgumentsGenerator', () => {

    describe('#createArgumentTemplate', () => {
        it('creates arg file for choice', () => {
            // GIVEN
            const service: EndpointService = {
                "args": [
                    {
                        "description": "domain file",
                        "name": "domain",
                        "type": "file"
                    },
                    {
                        "description": "problem file",
                        "name": "problem",
                        "type": "file"
                    },
                    {
                        "choices": [
                            {
                                "display_value": "Kstar Blind k=1",
                                "value": "kstar(blind(),k=1)"
                            },
                            {
                                "display_value": "Kstar Blind k=2",
                                "value": "kstar(blind(),k=2)"
                            }
                        ],
                        "default": "kstar(blind(),k=1)",
                        "description": "Search Algorithm",
                        "name": "search_algorithm",
                        "type": "categorical"
                    }
                ],
                "call": "kstar {domain} {problem} --search '{search_algorithm}'",
                "return": {
                    "files": "found_plans/sas_plan.*",
                    "type": "generic"
                }
            };
            const endpoint: SelectedEndpoint = {
                endpoint: 'solve',
                service: service,
                manifest: {
                    "dependencies": [],
                    "description": "https://github.com/ctpelok77/kstar",
                    "endpoint": {
                        "services": {
                            "solve": service
                        }
                    },
                    "install-size": "36M",
                    "name": "K* planner for the top-k planning problem",
                    package_name: "kstar",
                    "runnable": true
                }
            };
            const selector = new PlannerArgumentsGenerator(endpoint);

            // WHEN
            const actualText = selector.createArgumentTemplate();
            const errors: jsonc.ParseError[] = [];
            const actual: PackagedServerRequestArgs = jsonc.parse(actualText, errors);
            // console.log(actual);

            // THEN
            // expect(errors).to.be.empty;
            expect(actual["search_algorithm"]).to.equal("kstar(blind(),k=1)", "default search_algorithm value");
        });
    });
});
