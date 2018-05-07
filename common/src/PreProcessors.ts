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

export abstract class PreProcessor {
    constructor(private metaDataLine?: string) { }
    abstract transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string>;
    abstract transformSync(input: string, workingDirectory: string, outputWindow: OutputAdaptor): string;
    abstract toString(): string;
    removeMetaDataLine(text: string) { 
        this.metaDataLine;
        let pattern = /^;;\s*!pre-parsing:/;
        
        return text.split('\n').map(line => pattern.test(line) ? "; Generated from meta-data" : line).join('\n');
    }
}

/**
 * Shell command based pre-processor.
 */
export class CommandPreProcessor extends PreProcessor {
    constructor(public command: string, public args: string[], metaDataLine?: string) { 
        super(metaDataLine); 
    }

    toString(): string {
        return `${this.command} ` + this.args.join(' ');
    }

    static fromJson(json: any): any {
        return new CommandPreProcessor(json["command"], json["args"], '');
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {

        let command = this.command + ' ' + this.args.join(' ');
        let that = this;

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

                    resolve(that.removeMetaDataLine(stdout));
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

            return this.removeMetaDataLine(outputBuffer.toString());

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
 * Python-based pre-processor
 */
export class PythonPreProcessor extends CommandPreProcessor {
    constructor(pythonPath: string, script: string, args: string[], metaDataLine?: string) {
        super(pythonPath, [script].concat(args), metaDataLine);
    }

    static fromJson(json: any): any {
        json
        throw "For Jinja2 pre-processor, use the constructor instead"
    }
}

/**
 * Jinja2 pre-processor
 */
export class Jinja2PreProcessor extends PythonPreProcessor {
    constructor(pythonPath: string, extensionRoot: string, public dataFileName: string, metaDataLine?: string) {
        super(pythonPath, path.join(extensionRoot, "scripts", "transform_jinja2.py"), [dataFileName], metaDataLine);
    }

    static fromJson(json: any): any {
        json
        throw "For Jinja2 pre-processor, use the constructor instead"
    }
}

/**
 * Nunjucks based pre-processor
 */
export class NunjucksPreProcessor extends PreProcessor {
    data: any;
    nunjucksEnv: nunjucks.Environment;

    constructor(public dataFileName: string, workingDirectory: string, metaDataLine: string, preserveWhitespace: boolean) { 
        super(metaDataLine);
        let dataPath = path.join(workingDirectory, dataFileName);
        let dataText = readFileSync(dataPath);
        this.data = JSON.parse(dataText.toLocaleString());
        this.nunjucksEnv = nunjucks.configure({ trimBlocks: false, lstripBlocks: !preserveWhitespace, throwOnUndefined: true });
        this.nunjucksEnv.addFilter('map', function(array, attribute) { 
            return array.map((item: any) => item[attribute]); 
        });
    }

    toString(): string {
        return `Nunjucks ${this.dataFileName}`;
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {
        return this.transformSync(input, workingDirectory, outputWindow);
    }
   
    transformSync(input: string, workingDirectory: string, outputWindow: OutputAdaptor): string {

        workingDirectory;

        try {

            let translated = this.nunjucksEnv.renderString(input, {data: this.data});
    
            return this.removeMetaDataLine(translated);
        } catch (error) {
            outputWindow.appendLine('Failed to transform the problem file.')
            outputWindow.appendLine(error.message)
            if(error.stderr) outputWindow.appendLine(error.stderr.toString())
            outputWindow.show();
            return input;
        }
    }
}