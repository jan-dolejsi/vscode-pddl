/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { extensions } from 'vscode';

export class ExtensionInfo {
    private extensionId: string;
    private extensionVersion: string;
    public static readonly EXTENSION_ID = "jan-dolejsi.pddl";

    constructor(extensionId = ExtensionInfo.EXTENSION_ID) {
        let extension = extensions.getExtension(extensionId);
        if (extension === undefined) { throw new Error('Extension not found: ' + ExtensionInfo.EXTENSION_ID); }
        this.extensionId = extension.id;
        this.extensionVersion = <string>extension.packageJSON["version"];
    }

    getId(): string {
        return this.extensionId;
    }

    getVersion(): string {
        return this.extensionVersion;
    }
}