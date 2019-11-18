/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */

'use strict';

import { PreProcessor, CommandPreProcessor, OutputAdaptor, NunjucksPreProcessor, Jinja2PreProcessor, PythonPreProcessor, PreProcessingError } from "./PreProcessors";
import { PddlExtensionContext } from "./PddlExtensionContext";

export class ProblemParserPreProcessor {
    private problemCompletePattern = /^;;\s*!pre-parsing:\s*{\s*type:\s*"(command|nunjucks|jinja2|python)"\s*,\s*(command:\s*"([\w:\-/\\\. ]+)"\s*(,\s*args:\s*\[([^\]]*)\])?|data:\s*"([\w:\-/\\\. ]+)")\s*}/gm;

    constructor(private context: PddlExtensionContext) {

    }

    async process(preProcessor: PreProcessor, templatedProblem: string, workingDirectory: string): Promise<string> {

        if (preProcessor) {
            let transformed = await preProcessor.transform(templatedProblem, workingDirectory, new ConsoleOutputAdaptor());
            console.log("Pre-processed successfully using " + preProcessor.toString());
            return transformed || templatedProblem;
        }
        else {
            return templatedProblem;
        }
    }

    createPreProcessor(templatedProblem: string): PreProcessor | undefined {
        let preProcessor: PreProcessor | undefined;

        this.problemCompletePattern.lastIndex = 0;
        let match = this.problemCompletePattern.exec(templatedProblem);
        if (match && match[1]) {
            switch (match[1]) {
                case "command":
                    let args = this.parseArgs(match[5]);
                    preProcessor = new CommandPreProcessor(match[3], args, match[0], match.index);
                    break;
                case "python":
                    try {
                        let args1 = this.parseArgs(match[5]);
                        preProcessor = new PythonPreProcessor(this.context.pythonPath(), match[3], args1, match[0], match.index);
                    } catch (err) {
                        console.log(err);
                        throw new PreProcessingError(err.message || err, 0, 0);
                    }
                    break;
                case "nunjucks":
                    try {
                        preProcessor = new NunjucksPreProcessor(match[6], match[0], match.index, true);
                    } catch (err) {
                        console.log(err);
                        throw new PreProcessingError(err.message || err, 0, 0);
                    }
                    break;
                case "jinja2":
                    if (!this.context) { break; }
                    try {
                        preProcessor = new Jinja2PreProcessor(this.context.pythonPath(), this.context.extensionPath, match[6], match[0], match.index);
                    } catch (err) {
                        console.log(err);
                        throw new PreProcessingError(err.message || err, 0, 0);
                    }
                    break;
                default:
                    console.log("Not supported: " + match[1]);
            }
        }

        return preProcessor;
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