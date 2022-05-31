/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as jsonc from 'jsonc-parser';
import { PackagedServerRequestArgs } from 'pddl-planning-service-client';
import { EndpointServiceArgument, EndpointServiceArgumentChoice, SelectedEndpoint } from './PackagedPlanners';

/** Async planner-as-a-service argument generator. Separated out for unit-testing. */
export class PlannerArgumentsGenerator {

    public static readonly DEFAULT: PackagedServerRequestArgs = {};

    constructor(protected readonly selectedEndpoint: SelectedEndpoint) {
    }

    createArgumentTemplate(): string {
        const argsContent = this.selectedEndpoint.service.args
            .filter(arg => PlannerArgumentsGenerator.isConfigurable(arg))
            .map(arg => this.convertArgToJson(arg))
            .join("\n");
        const content = `// Solver arguments for ${this.selectedEndpoint.manifest.name} /${this.selectedEndpoint.endpoint}\n{${argsContent}}`;
        // const errors: jsonc.ParseError[] = [];
        // const node = jsonc.parseTree(content, errors, {});
        const formattedContent = jsonc.applyEdits(content, jsonc.format(content, undefined, {}));
        return formattedContent;
    }

    static isConfigurable(arg: EndpointServiceArgument): boolean {
        return !["domain", "problem"].includes(arg.name);
    }

    convertArgToJson(arg: EndpointServiceArgument): string {
        const value = this.convertArgValueToJson(arg);
        return `
        // ${arg.description}
        "${arg.name}": ${value}
        `;
    }
    convertArgValueToJson(arg: EndpointServiceArgument): string {
        switch (arg.type) {
            case 'int':
                if (arg.default !== undefined) {
                    return `${arg.default}, // default value is ${arg.default}`;
                } else {
                    return "0, // default value not provided";
                }
            case 'categorical':
                if (arg.choices && arg.choices.length > 0) {
                    const defaultChoice = arg.default ?? arg.choices[0].value;
                    return arg.choices
                        .map(choice => this.convertArgChoiceToJson(defaultChoice, choice))
                        .join('\n');
                } else {
                    return `"?",`;
                }
            default:
                if (arg.default !== undefined) {
                    return `"${arg.default}", // default value is ${arg.default}`;
                } else {
                    return `"?", // default value not provided`;
                }
        }
    }

    private convertArgChoiceToJson(defaultChoice: string | number | boolean, choice: EndpointServiceArgumentChoice): string {
        let valueRow = `"${choice.value}", // ${choice.display_value}`;
        if (defaultChoice === choice.value) {
            // this is the default value;
            valueRow += ' (default)';
        } else {
            valueRow = '// ' + valueRow;
        }
        return valueRow;
    }
}
