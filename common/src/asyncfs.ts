/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
import util = require('util');

export const readFile = util.promisify(fs.readFile);
export const writeFile = util.promisify(fs.writeFile);
export const write = util.promisify(fs.write);
export const exists = util.promisify(fs.exists);
export const readdir = util.promisify(fs.readdir);
export const unlink = util.promisify(fs.unlink);
export const rmdir = util.promisify(fs.rmdir);
export const stat = util.promisify(fs.stat);

export const mkdirIfDoesNotExist = (path: string, mode: number) => new Promise<void>(
    (resolve, reject) => fs.mkdir(path, mode,
        err => (err && err.code !== 'EEXIST') ? reject(err) : resolve()
    )
);

export async function isEmpty(directory: string): Promise<boolean> {
    let stats = await stat(directory);
    if (!stats.isDirectory()) {
        throw new Error("Not a directory: " + directory);
    }

    let dirContent = await readdir(directory);
    return dirContent.length === 0;
}