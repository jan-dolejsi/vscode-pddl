/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';
const util = require('util');
require('util.promisify').shim();

export const readFile = util.promisify(fs.readFile);
export const writeFile = util.promisify(fs.writeFile);
export const exists = util.promisify(fs.exists);
export const readdir = util.promisify(fs.readdir);
export const unlink = util.promisify(fs.unlink);
export const stat = util.promisify(fs.stat);

export const mkdirIfDoesNotExist = (path: string, mode: number) => new Promise(
    (resolve, reject) => fs.mkdir(path, mode,
        err => (err && err.code !== 'EEXIST') ? reject(err) : resolve()
    )
);