/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as nunjucks from 'nunjucks';

export interface OutputAdaptor {
    appendLine(text: string): void;
    show(): void;
}

export interface PreProcessor {
    transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string>;
    transformSync(input: string, workingDirectory: string, outputWindow: OutputAdaptor): string;
}

/**
 * Shell command based pre-processor.
 */
export class CommandPreProcessor implements PreProcessor {
    constructor(public command: string, public args: string[]) { }

    static fromJson(json: any): any {
        return new CommandPreProcessor(json["command"], json["args"]);
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {

        let command = this.command + ' ' + this.args.join(' ')

        return new Promise<string>(function (resolve, reject) {
            let childProcess = process.exec(command,
                {
                    cwd: workingDirectory
                },
                (error, stdout, stderr) => {

                    if (stderr) {
                        outputWindow.appendLine(stderr);
                    }

                    if (error) {
                        outputWindow.appendLine('Failed to transform the problem file.')
                        outputWindow.appendLine(error.message)
                        outputWindow.show();
                        reject(error);
                    }

                    resolve(stdout);
                });
            childProcess.stdin.write(input);
            childProcess.stdin.end();

        });
    }


    transformSync(input: string, workingDirectory: string, outputWindow: OutputAdaptor): string {

        let command = this.command + ' ' + this.args.join(' ')

        try {

            let outputBuffer = process.execSync(command,
                {
                    cwd: workingDirectory,
                    input: input,
                    stdio: ['pipe']
                });

            return outputBuffer.toString();

        } catch (error) {
            outputWindow.appendLine('Failed to transform the problem file.')
            outputWindow.appendLine(error.message)
            if(error.stderr) outputWindow.appendLine(error.stderr.toString())
            outputWindow.show();
            return input;
        }
    }
}

/**
 * Jinja2 based pre-processor
 */
export class Jinja2PreProcessor implements PreProcessor {
    data: any;
    nunjucksEnv: nunjucks.Environment;

    constructor(public dataFile: any, workingDirectory: string) { 
        let dataPath = path.join(workingDirectory, dataFile);
        let dataText = readFileSync(dataPath);
        this.data = JSON.parse(dataText.toLocaleString());
        this.nunjucksEnv = nunjucks.configure({ trimBlocks: false, lstripBlocks: false, throwOnUndefined: true});
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {
        return this.transformSync(input, workingDirectory, outputWindow);
    }
   
    transformSync(input: string, workingDirectory: string, outputWindow: OutputAdaptor): string {

        workingDirectory;

        try {

            let translated = this.nunjucksEnv.renderString(input, {data: this.data});
    
            return translated;
        } catch (error) {
            outputWindow.appendLine('Failed to transform the problem file.')
            outputWindow.appendLine(error.message)
            if(error.stderr) outputWindow.appendLine(error.stderr.toString())
            outputWindow.show();
            return input;
        }
    }
}