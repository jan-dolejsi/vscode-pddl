/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { Uri } from 'vscode';
import { WebviewAdapter } from './view';

/**
 * Base class for domain/problem view panels.
 */
export class BaseViewPanel {

    constructor(public readonly uri: Uri, protected readonly panel: WebviewAdapter) {
    }

    public async postMessage(command: string, payload: any): Promise<boolean> {
        let message: any = { command: command };
        Object.keys(payload).forEach(key => message[key] = payload[key]);

        return this.panel.postMessage(message);
    }
}