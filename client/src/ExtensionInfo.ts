/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { extensions } from 'vscode';

export class ExtensionInfo {
    private extensionId: string;
    private extensionVersion: string;

    constructor() {
        let extension = extensions.getExtension("jan-dolejsi.pddl");
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