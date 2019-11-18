/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

 import {
    Range
 } from 'vscode';

import { Validator } from './validator';
 
export class ProblemPattern {
    regEx: RegExp;
    indexMap: number[];

    /**
     * Constructs a problem pattern
     * 
     * @param patternWithMatchGroupOrder pattern in the form /pattern/flags/order,
     *  where the order part is a comma separated list of order of the capturing groups inside the pattern filename,severity,line,column,message (as a 1-based index)
     * @param fileNames names of files parsed
     */
    constructor(patternWithMatchGroupOrder: string, fileNames: string[]){
        let fileNamesJoint = fileNames.join('|')
            // escape all backslashes    
            .split('\\').join("\\\\")
            // escape all dots
            .split('.').join("\\.");

        let pattern, flags, order: string;
        [pattern, flags, order] = patternWithMatchGroupOrder.split('/').slice(1);
        
        pattern = pattern.replace('$(filePaths)', fileNamesJoint);

        this.regEx = new RegExp(pattern, flags);

        this.indexMap = order.split(',').map(str => parseInt(str));
    }

    getFilePath(match: RegExpExecArray): string{
        return match[this.mapIndex(0)];
    }

    getSeverity(match: RegExpExecArray): string {
        return match[this.mapIndex(1)];
    }

    getLine(match: RegExpExecArray): number {
        return parseInt(match[this.mapIndex(2)]) -1;
    }

    getCharacter(match: RegExpExecArray): number | undefined {
        let index = this.mapIndex(3);
        return index ? parseInt(match[index]) -1 : undefined;
    }

    getMessage(match: RegExpExecArray): string {
        return match[this.mapIndex(4)];
    }

    getRange(match: RegExpExecArray): Range{
        let line = this.getLine(match);
        let character = this.getCharacter(match);
        return character !== undefined ? 
            Validator.createRange(line, character) :
            Validator.createLineRange(line);
    }

    private mapIndex(i: number) {
        return this.indexMap[i];
    }
}