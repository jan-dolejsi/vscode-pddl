/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */

'use strict';

// var Sync = require('sync');
import { PreProcessor, CommandPreProcessor, OutputAdaptor, NunjucksPreProcessor, Jinja2PreProcessor, PythonPreProcessor } from "./PreProcessors";
import { PddlExtensionContext } from "./PddlExtensionContext";

export class ProblemParserPreProcessor {
    problemCompletePattern = /^;;\s*!pre-parsing:\s*{\s*type:\s*"(command|nunjucks|jinja2)"\s*,\s*(command:\s*"([\w:\-/\\\. ]+)"\s*(,\s*args:\s*\[([^\]]*)\])?|data:\s*"([\w:\-/\\\. ]+)")\s*}/gm;

    constructor(private context: PddlExtensionContext) {

    }

    process(templatedProblem: string, workingDirectory: string): string {

        let preProcessor: PreProcessor = null;

        this.problemCompletePattern.lastIndex = 0;
        let match = this.problemCompletePattern.exec(templatedProblem);
        if (match && match[1]) {
            switch (match[1]) {
                case "command":
                    let args = this.parseArgs(match[5]);
                    preProcessor = new CommandPreProcessor(match[3], args, match[0]);
                    break;
                case "python":
                    try {
                        let args1 = this.parseArgs(match[5]);
                        // todo: here we ignore the python.pythonPath configuration and just one the %path%
                        preProcessor = new PythonPreProcessor("python", match[3], args1, match[0]);
                    } catch (err) {
                        console.log(err);
                    }
                    break;
                case "nunjucks":
                    try {
                        preProcessor = new NunjucksPreProcessor(match[6], match[0], true);
                    } catch (err) {
                        console.log(err);
                    }
                    break;
                case "jinja2":
                    if (!this.context) break;
                    try {
                        // todo: here we ignore the python.pythonPath configuration and just one the %path%
                        preProcessor = new Jinja2PreProcessor("python", this.context.extensionPath, match[6], match[0]);
                    } catch (err) {
                        console.log(err);
                    }
                    break;
                default:
                    console.log("Not supported: " + match[1]);
            }
        }

        if (preProcessor) {
            let transformed: string = null;

            transformed = preProcessor.transformSync(templatedProblem, workingDirectory, new ConsoleOutputAdaptor());
            console.log("Pre-processed successfully using " + preProcessor.toString());
            return transformed ? transformed : templatedProblem;
        }
        else {
            return templatedProblem;
        }
    }

    parseArgs(argsText: string): string[] {
        return argsText ? argsText.split(',').map(arg => arg.trim().slice(1, -1)) : [];
    }
}

class ConsoleOutputAdaptor implements OutputAdaptor {
    appendLine(text: string): void {
        console.info(text);
    }
    show(): void {
        // do nothing
    }
}