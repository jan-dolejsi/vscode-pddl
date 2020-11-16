/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { FileSystemError, FileType, Uri, workspace } from "vscode";

export async function exists(uri: Uri): Promise<boolean> {
    try {
        await workspace.fs.stat(uri);
    } catch (err) {
        if (err instanceof FileSystemError && err.code === 'FileNotFound') {
            return false;
        } else {
            throw err;
        }
    }

    return true;
}

export async function doesNotExist(uri: Uri): Promise<boolean> {
    return !(await exists(uri));
}

export async function isDirectory(uri: Uri): Promise<boolean> {
    const stat = await workspace.fs.stat(uri);
    return stat.type === FileType.Directory;
}

export async function isNotDirectory(uri: Uri): Promise<boolean> {
    return !(await isDirectory(uri));
}

export async function isFile(uri: Uri): Promise<boolean> {
    const stat = await workspace.fs.stat(uri);
    return stat.type === FileType.File;
}