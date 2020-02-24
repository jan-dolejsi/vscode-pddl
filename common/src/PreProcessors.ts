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
    constructor(protected metaDataLine?: string, public readonly metaDataLineOffset?: number) { }
    abstract transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string>;
    abstract toString(): string;
    abstract getInputFiles(): string[];
    abstract getLabel(): string;

    protected removeMetaDataLine(text: string) {
        let pattern = /^;;\s*!pre-parsing:/;

        return text.split('\n').map(line => pattern.test(line) ? "; Generated from a PDDL template and a data file" : line).join('\n');
    }
}

/**
 * Shell command based pre-processor.
 */
export class CommandPreProcessor extends PreProcessor {
    constructor(private command: string, protected args: string[], metaDataLine?: string, metaDataLineOffset?: number) {
        super(metaDataLine, metaDataLineOffset);
    }

    toString(): string {
        return `${this.command} ` + this.args.join(' ');
    }

    static fromJson(json: any): any {
        return new CommandPreProcessor(json["command"], json["args"], '');
    }

    getInputFiles(): string[] {
        return [];
    }

    getLabel(): string {
        return this.command;
    }

    handleError(error: Error): void {
        throw new PreProcessingError(error.message, 0, 0);
    }

    handleErrorAsync(error: Error, reject: (message: any) => void): void {
        reject(new PreProcessingError(error.message, 0, 0));
    }

    async transform(input: string, workingDirectory: string, outputWindow: OutputAdaptor): Promise<string> {

        let that = this;

        return new Promise<string>(function (resolve, reject) {
            let childProcess = process.execFile(that.command,
                that.args,
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
                        that.handleErrorAsync(error, reject);
                        resolve(input);
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
    constructor(pythonPath: string, script: string, args: string[], metaDataLine?: string, metaDataLineOffset?: number) {
        super(pythonPath, [script].concat(args), metaDataLine, metaDataLineOffset);
    }

    getInputFiles(): string[] {
        return this.args;
    }

    getLabel(): string {
        return this.args.join(' ');
    }

    static fromJson(_json: any): any {
        throw new Error("For Jinja2 pre-processor, use the constructor instead");
    }

    private static readonly JINJA2_TEMPLATE_SYNTAX_ERROR_PREFIX = 'jinja2.exceptions.TemplateSyntaxError: ';
    private static readonly PYTHON_JSON_DECODER = 'json.decoder.JSONDecodeError: ';

    handleErrorAsync(error: Error, reject: (message: any) => void): void {
        let errorLines = error.message.split('\n');
        
        let templateSyntaxError = errorLines.find(row => row.startsWith(PythonPreProcessor.JINJA2_TEMPLATE_SYNTAX_ERROR_PREFIX));
        if (templateSyntaxError) {
            reject(new PreProcessingError(templateSyntaxError.substring(PythonPreProcessor.JINJA2_TEMPLATE_SYNTAX_ERROR_PREFIX.length), 0, 0));
            return;
        }
        
        let pythonJsonError = errorLines.find(row => row.startsWith(PythonPreProcessor.PYTHON_JSON_DECODER));
        if (pythonJsonError) {
            reject(new PreProcessingError('JSON Error: ' + pythonJsonError.substring(PythonPreProcessor.PYTHON_JSON_DECODER.length), 0, 0));
            return;
        }
        
        super.handleErrorAsync(error, reject);
    }
}

/**
 * Jinja2 pre-processor
 */
export class Jinja2PreProcessor extends PythonPreProcessor {
    constructor(pythonPath: string, extensionRoot: string, public dataFileName: string, metaDataLine?: string, metaDataLineOffset?: number) {
        super(pythonPath, path.join(extensionRoot, "scripts", "transform_jinja2.py"), [dataFileName], metaDataLine, metaDataLineOffset);
    }

    static fromJson(_json: any): any {
        throw new Error("For Jinja2 pre-processor, use the constructor instead");
    }

    getInputFiles(): string[] {
        return [this.dataFileName];
    }

    getLabel(): string {
        return this.dataFileName;
    }
}

/**
 * Nunjucks based pre-processor
 */
export class NunjucksPreProcessor extends PreProcessor {
    nunjucksEnv: nunjucks.Environment;

    constructor(public dataFileName: string, metaDataLine: string | undefined, metaDataLineOffset: number, preserveWhitespace: boolean) {
        super(metaDataLine, metaDataLineOffset);
        this.nunjucksEnv = nunjucks.configure({ trimBlocks: false, lstripBlocks: !preserveWhitespace, throwOnUndefined: true });
        this.nunjucksEnv.addFilter('map', function (array, attribute) {
            return array.map((item: any) => item[attribute]);
        });
        this.nunjucksEnv.addFilter('setAttribute', function (dictionary, key, value) {
            dictionary[key] = value;
            return dictionary;
        });
    }

    getInputFiles(): string[] {
        return [this.dataFileName];
    }

    getLabel(): string {
        return this.dataFileName;
    }

    toString(): string {
        return `Nunjucks ${this.dataFileName}`;
    }

    async transform(input: string, workingDirectory: string, _outputWindow: OutputAdaptor): Promise<string> {
        let dataPath = path.join(workingDirectory, this.dataFileName);
        let dataText = await afs.readFile(dataPath);
        let data: any;

        try {
            data = JSON.parse(dataText.toLocaleString());
        } catch (error) {
            return `Failed to read from '${dataPath}'.`;
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
    stack?: string;
    constructor(public readonly message: string, public readonly line: number, public readonly column: number) {
    }

    get name(): string {
        return 'pre-processing_error';
    }
}