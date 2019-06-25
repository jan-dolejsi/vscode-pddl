/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';
import * as path from 'path';
import * as nunjucks from 'nunjucks';
import * as afs from './asyncfs';

export interface OutputAdaptor {
    appendLine(text: string): void;
    show(): void;
}

export abstract class PreProcessor {
    constructor(private metaDataLine?: string) { }
    abstract transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string>;
    abstract toString(): string;
    removeMetaDataLine(text: string) {
        this.metaDataLine;
        let pattern = /^;;\s*!pre-parsing:/;

        return text.split('\n').map(line => pattern.test(line) ? "; Generated from a PDDL template and a data file" : line).join('\n');
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
                        outputWindow.appendLine('Failed to transform the problem file.');
                        outputWindow.appendLine(error.message);
                        outputWindow.show();
                        reject(error);
                        resolve(input);
                        return;
                    }
                    else {
                        resolve(that.removeMetaDataLine(stdout));
                        return;
                    }
                });
            childProcess.stdin.write(input);
            childProcess.stdin.end();

        });
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
        json;
        throw new Error("For Jinja2 pre-processor, use the constructor instead");
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
        json;
        throw new Error("For Jinja2 pre-processor, use the constructor instead");
    }
}

/**
 * Nunjucks based pre-processor
 */
export class NunjucksPreProcessor extends PreProcessor {
    nunjucksEnv: nunjucks.Environment;

    constructor(public dataFileName: string, metaDataLine: string, preserveWhitespace: boolean) {
        super(metaDataLine);
        this.nunjucksEnv = nunjucks.configure({ trimBlocks: false, lstripBlocks: !preserveWhitespace, throwOnUndefined: true });
        this.nunjucksEnv.addFilter('map', function (array, attribute) {
            return array.map((item: any) => item[attribute]);
        });
        this.nunjucksEnv.addFilter('setAttribute', function (dictionary, key, value) {
            dictionary[key] = value;
            return dictionary;
        });
    }

    toString(): string {
        return `Nunjucks ${this.dataFileName}`;
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {
        let dataPath = path.join(workingDirectory, this.dataFileName);
        let dataText = await afs.readFile(dataPath);
        let data: any;

        try {
            data = JSON.parse(dataText.toLocaleString());
        } catch (error) {
            outputWindow.appendLine(`Failed to read from ${this.dataFileName}.`);
            outputWindow.appendLine(error.message);
            outputWindow.show();
            return input;
        }

        try {

            let translated = this.nunjucksEnv.renderString(input, { data: data });

            return this.removeMetaDataLine(translated);
        } catch (error) {
            let pattern = /\((.+)\)\s+\[Line\s+(\d+),\s+Column\s+(\d+)\]/;
            let match = pattern.exec(error.message);
            if (match) {
                throw new PreProcessingError(match[1], parseInt(match[2]) - 1, parseInt(match[3]) - 1);
            } else {
                throw new PreProcessingError(error.message, 0, 0);
            }
        }
    }
}

export class PreProcessingError implements Error {
    name: string;
    stack?: string;
    constructor(public message: string, public line: number, public column: number) {

    }
}