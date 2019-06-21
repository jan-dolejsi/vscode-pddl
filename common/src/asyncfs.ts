/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as fs from 'fs';

export async function exists(path: string): Promise<boolean> {
    return await fs.promises.access(path).then(() => true).catch(() => false);
}

const util = require('util');

export const write = util.promisify(fs.write);

export const mkdirIfDoesNotExist = (path: string, mode: number) => new Promise<void>(
    (resolve, reject) => fs.mkdir(path, mode,
        err => (err && err.code !== 'EEXIST') ? reject(err) : resolve()
    )
);